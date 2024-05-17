import {
    codeBlock,
    Collection,
    Colors,
    EmbedBuilder,
    escapeCodeBlock,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    StickerFormatType
} from "discord.js";

import { EMBED_FIELD_CHAR_LIMIT, EMPTY_MESSAGE_CONTENT, LOG_ENTRY_DATE_FORMAT } from "./constants";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { elipsify, pluralize, startCronJob, userMentionWithId } from "./index";
import { client, prisma } from "./..";

import Logger from "./logger";
import ConfigManager from "@managers/config/ConfigManager";

export class Messages {
    // Cache for messages that haven't been stored in the database yet
    private static dbQueue = new Collection<Snowflake, Message>();
    // The most recent message deletion audit log.
    // Used to improve the accuracy of blaming
    private static messageDeleteAuditLog?: MessageDeleteAuditLog;
    // Queue for messages that need to be purged
    static purgeQueue: PurgeOptions[] = [];

    static async get(id: Snowflake): Promise<Message | null> {
        let message = Messages.dbQueue.get(id) ?? null;

        if (!message) {
            message = await prisma.message.findUnique({ where: { id } });
        }

        return message;
    }

    // @returns The ID of the user responsible for the deletion
    static getBlame(data: MessageDeleteAuditLog): Snowflake | null {
        const log = Messages.messageDeleteAuditLog;
        const logHasChanged = !log
            || log.channelId !== data.channelId
            || log.targetId !== data.targetId
            || log.executorId !== data.executorId;

        // A new audit log has been created
        // Meaning the count of the previous log was reset and is no longer needed
        if (logHasChanged) {
            Messages.messageDeleteAuditLog = data;
            const dateDiff = Date.now() - data.createdAt.getTime();

            // The log is new and the count is 1
            if (data.count === 1 && dateDiff < 3000) {
                return data.executorId;
            }

            return null;
        }

        // The log is the same and the count has increased by one
        if (data.count === log.count + 1) {
            log.count++;
            return data.executorId;
        }

        return null;
    }

    /**
     * Get a user's messages from cache or the database
     *
     * @param userId - The target user's ID
     * @param channelId - The source channel's ID
     * @param limit - The maximum number of messages to return
     */
    static async deleteMessagesByUser(userId: Snowflake, channelId: Snowflake, limit: number): Promise<Message[]> {
        const messages = [];

        for (const message of Messages.dbQueue.values()) {
            if (
                message.author_id !== userId ||
                message.channel_id !== channelId ||
                message.deleted
            ) continue;

            if (messages.length === limit) break;

            message.deleted = true;
            messages.push(message);
        }

        // Fetch remaining messages from the database if an insufficient amount was cached
        if (messages.length < limit) {
            const createdAtThreshold = Date.now() - ConfigManager.globalConfig.database.messages.ttl;

            // @formatter:off
            const stored = await prisma.$queryRaw<Message[]>`
                UPDATE Message
                SET deleted = true
                WHERE id IN (
                    SELECT id FROM Message
                    WHERE author_id = ${userId}
                        AND channel_id = ${channelId}
                        AND deleted = false
                        AND created_at < ${createdAtThreshold}
                    ORDER BY created_at DESC
                    LIMIT ${limit - messages.length}
                )
                RETURNING *;
            `;
            // @formatter:on

            // Combined cached and stored messages
            return messages.concat(stored);
        }

        return messages;
    }

    static set(message: DiscordMessage<true>): void {
        const serializedMessage = prepareMessageForStorage(message);
        Messages.dbQueue.set(message.id, serializedMessage);
    }

    /**
     * Update the deletion state of a message
     * @param id - ID of the message to delete
     */
    static async delete(id: Snowflake): Promise<Message | null> {
        // Try to get the message form cache
        let message = Messages.dbQueue.get(id) ?? null;

        // Modify the cache if the message is cached
        // Otherwise, update the message in the database
        if (message) {
            message.deleted = true;
        } else {
            message = await prisma.message.update({
                data: { deleted: true },
                where: { id }
            }).catch(() => null);
        }

        return message;
    }

    /**
     * Update the deletion state of multiple messages in bulk
     *
     * @param messageCollection - The messages to delete
     */
    static async deleteMany(messageCollection: Collection<Snowflake, PartialMessage | DiscordMessage<true>>): Promise<Message[]> {
        const ids = Array.from(messageCollection.keys());

        // Try to get the messages from cache
        const messages = Messages.dbQueue.filter(message =>
            ids.includes(message.id) && !message.deleted
        );

        // Update the deletion state of the cached messages
        const deletedMessages = messages.map(message => {
            message.deleted = true;
            return message;
        });

        // Update whatever wasn't cached in the database
        if (messages.size !== deletedMessages.length) {
            const dbDeletedMessages = await prisma.$queryRaw<Message[]>`
                UPDATE Message
                SET deleted = true
                WHERE id IN (${ids.join(",")}) RETURNING *;
            `;

            // Merge the cached and stored messages
            return deletedMessages.concat(dbDeletedMessages);
        }

        return deletedMessages;
    }

    /**
     * Update the content of a message in cache and/or the database
     *
     * @param id - ID of the message to update
     * @param newContent - The new content of the message
     */
    static async updateContent(id: Snowflake, newContent: string): Promise<string> {
        // Try to get the message from cache
        const message = Messages.dbQueue.get(id);

        // Modify the cache if the message is cached
        if (message) {
            const oldContent = message.content ?? EMPTY_MESSAGE_CONTENT;
            message.content = newContent;

            return oldContent;
        }

        // Update the message in the database
        const { old_content } = await prisma.$queryRaw<{ old_content: string | null }>`
            UPDATE Message
            SET content = ${newContent}
            WHERE id = ${id} RETURNING (
                    SELECT content
                    FROM Message
                    WHERE id = ${id}
                ) AS old_content;
        `;

        return old_content ?? EMPTY_MESSAGE_CONTENT;
    }

    // Clear the cache and store the messages in the database
    static async clear(): Promise<void> {
        Logger.info("Storing cached messages...");

        // Insert all cached messages into the database
        const messages = Array.from(Messages.dbQueue.values());
        const res = await prisma.message.createMany({ data: messages });

        // Empty the cache
        Messages.dbQueue.clear();
        Logger.info(`Stored ${res.count} ${pluralize(res.count, "message")}`);
    }

    // Start a cron job that will clear the cache and store the messages in the database
    static startDatabaseCronJob(): void {
        const insertionCron = ConfigManager.globalConfig.database.messages.insert_cron;
        const deletionCron = ConfigManager.globalConfig.database.messages.delete_cron;
        const ttl = ConfigManager.globalConfig.database.messages.ttl;

        startCronJob("STORE_MESSAGES", insertionCron, async () => {
            await Messages.clear();
        });

        startCronJob("DELETE_OLD_MESSAGES", deletionCron, async () => {
            const createdAtThreshold = new Date(Date.now() - ttl);
            const createdAtString = createdAtThreshold.toLocaleString(undefined, LOG_ENTRY_DATE_FORMAT);

            Logger.info(`Deleting messages created before ${createdAtString}...`);

            const res = await prisma.message.deleteMany({
                where: { created_at: { lte: createdAtThreshold } }
            });

            Logger.info(`Deleted ${res.count} ${pluralize(res.count, "message")} created before ${createdAtString}`);
        });
    }
}

// @returns Message object in a format appropriate for the database
export function prepareMessageForStorage(message: DiscordMessage<true>): Message {
    const stickerId = message.stickers.first()?.id ?? null;
    const referenceId = message.reference?.messageId ?? null;

    return {
        id: message.id,
        channel_id: message.channelId,
        author_id: message.author.id,
        guild_id: message.guildId,
        created_at: message.createdAt,
        content: message.content,
        sticker_id: stickerId,
        reference_id: referenceId,
        deleted: false
    };
}

/**
 * Prepend a reference embed to an embed array passed by reference
 *
 * @param reference - The reference message or its ID
 * @param embeds - The embed(s) to prepend the reference to
 */
export async function prependReferenceLog(reference: string | Message, embeds: EmbedBuilder[]): Promise<void> {
    // Fetch the reference if an ID is passed
    if (typeof reference === "string") {
        const cachedReference = await Messages.get(reference);
        if (!cachedReference) return;

        reference = cachedReference;
    }

    const referenceUrl = messageLink(reference.channel_id, reference.id, reference.guild_id);
    const embed = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: "Reference" })
        .setFields([
            {
                name: "Author",
                value: userMentionWithId(reference.author_id)
            },
            {
                name: reference.sticker_id ? "Sticker" : "Message Content",
                value: await formatMessageContentForLog(reference.content, reference.sticker_id, referenceUrl)
            }
        ])
        .setTimestamp(reference.created_at);

    // Insert the reference embed at the beginning of the array
    embeds.unshift(embed);
}

// Escape code blocks, truncate the content if it's too long, and wrap it in a code block
export async function formatMessageContentForLog(content: string | null, stickerId: string | null, url: string): Promise<string> {
    // Escape custom emoji
    const jumpUrl = hyperlink("Jump to message", url);

    if (!stickerId) {
        const escapedContent = content?.replace(/<(a?):([^:\n\r]+):(\d{17,19})>/g, "<$1\\:$2\\:$3>");
        const croppedContent = elipsify(escapedContent || EMPTY_MESSAGE_CONTENT, EMBED_FIELD_CHAR_LIMIT - 120);
        const formattedContent = codeBlock(escapeCodeBlock(croppedContent));

        return `${jumpUrl}\n${formattedContent}`;
    }

    const sticker = await client.fetchSticker(stickerId)
        .catch(() => null);

    if (sticker) {
        if (sticker.format === StickerFormatType.Lottie) {
            return `${jumpUrl}\n\`${sticker.name}\``;
        }

        return `${jumpUrl}\n\`${sticker.name}\` (${hyperlink("view", sticker.url)})`;
    }

    return "Sticker (failed to fetch)";
}

/**
 * Send a temporary reply to a message and delete it after a specified time
 *
 * @param message - The message to reply to
 * @param content - The content of the reply
 * @param ttl - The time-to-live of the reply in milliseconds
 */
export async function temporaryReply(message: DiscordMessage, content: string, ttl: number): Promise<void> {
    const reply = await message.reply({
        // Only allow the replied user to be mentioned
        allowedMentions: { parse: [], repliedUser: true },
        content
    }).catch(() => null);

    setTimeout(() => {
        reply?.delete().catch(() => null);
    }, ttl);
}


// Returns an entry in the format: `[DD/MM/YYYY, HH:MM:SS] AUTHOR_ID — MESSAGE_CONTENT`
export async function formatMessageLogEntry(message: Message): Promise<string> {
    const timestamp = new Date(message.created_at).toLocaleString(undefined, LOG_ENTRY_DATE_FORMAT);
    let content = message.content ?? EMPTY_MESSAGE_CONTENT;

    // If the message is a sticker, it cannot have message content
    if (message.sticker_id) {
        const sticker = await client.fetchSticker(message.sticker_id).catch(() => null);

        if (sticker && sticker.format === StickerFormatType.Lottie) {
            content = `Sticker "${sticker.name}": Lottie`;
        } else if (sticker) {
            content = `Sticker "${sticker.name}": ${sticker.url}`;
        }
    }

    return `[${timestamp}] ${message.author_id} — ${content}`;
}


interface PurgeOptions {
    channelId: Snowflake;
    messages: Message[];
}

interface MessageDeleteAuditLog {
    executorId: Snowflake;
    targetId: Snowflake;
    channelId: Snowflake;
    createdAt: Date;
    count: number;
}