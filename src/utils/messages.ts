import {
    codeBlock,
    Collection,
    Colors,
    EmbedBuilder,
    escapeCodeBlock, GuildTextBasedChannel,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    StickerFormatType
} from "discord.js";

import {
    EMBED_FIELD_CHAR_LIMIT,
    EMPTY_MESSAGE_CONTENT,
    LOG_ENTRY_DATE_FORMAT,
    MESSAGE_DELETE_THRESHOLD
} from "./constants";

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
     * @param period - The period over which to remove the messages (in milliseconds)
     * @param limit - The maximum number of messages to return
     */
    static async deleteMessagesByUser(userId: Snowflake, channelId: Snowflake, limit: number, period?: number): Promise<Message[]> {
        const messages = [];

        // Ensure the period doesn't exceed the message TTL
        if (!period || period > MESSAGE_DELETE_THRESHOLD) {
            period = MESSAGE_DELETE_THRESHOLD;
        }

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
            const msCreatedAtThreshold = Date.now() - period;

            // The messages have to be fetched first since LIMIT cannot be used with update()
            const stored = await prisma.message.findMany({
                orderBy: { created_at: "desc" },
                take: limit - messages.length,
                where: {
                    author_id: userId,
                    channel_id: channelId,
                    created_at: { gt: new Date(msCreatedAtThreshold) },
                    deleted: false
                }
            });

            // Update the deletion state of the stored messages
            await prisma.message.updateMany({
                where: {
                    id: { in: stored.map(message => message.id) }
                },
                data: { deleted: true }
            });

            // Combined cached and stored messages
            return messages.concat(stored);
        }

        return messages;
    }

    // Add a message to the database queue
    static queue(message: DiscordMessage<true>): void {
        const serializedMessage = Messages.serialize(message);
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
        // @formatter:off
        const { old_content } = await prisma.$queryRaw<{ old_content: string | null }>`
            UPDATE Message
            SET content = ${newContent}
            WHERE id = ${id} 
            RETURNING (
                SELECT content
                FROM Message
                WHERE id = ${id}
            ) AS old_content;
        `;
        // @formatter:on

        return old_content ?? EMPTY_MESSAGE_CONTENT;
    }

    // Clear the cache and store the messages in the database
    static async store(): Promise<void> {
        Logger.info("Storing cached messages...");

        // Insert all cached messages into the database
        const messages = Array.from(Messages.dbQueue.values());
        const { count } = await prisma.message.createMany({ data: messages });

        // Empty the cache
        Messages.dbQueue.clear();

        if (!count) {
            Logger.info("No messages were stored");
        } else {
            Logger.info(`Stored ${count} ${pluralize(count, "message")}`);
        }
    }

    // Start a cron job that will clear the cache and store the messages in the database
    static startDatabaseCronJob(): void {
        const insertionCron = ConfigManager.globalConfig.database.messages.insert_cron;
        const deletionCron = ConfigManager.globalConfig.database.messages.delete_cron;
        const ttl = ConfigManager.globalConfig.database.messages.ttl;

        // Store cached messages
        startCronJob("STORE_MESSAGES", insertionCron, async () => {
            await Messages.store();
        });

        // Remove messages that exceed the TTL from the database
        startCronJob("DELETE_OLD_MESSAGES", deletionCron, async () => {
            const createdAtThreshold = new Date(Date.now() - ttl);
            const createdAtString = createdAtThreshold.toLocaleString(undefined, LOG_ENTRY_DATE_FORMAT);

            Logger.info(`Deleting messages created before ${createdAtString}...`);

            const { count } = await prisma.message.deleteMany({
                where: { created_at: { lte: createdAtThreshold } }
            });

            if (!count) {
                Logger.info(`No messages were created before ${createdAtString}`);
            } else {
                Logger.info(`Deleted ${count} ${pluralize(count, "message")} created before ${createdAtString}`);
            }
        });
    }

    /** @returns Message object in a format appropriate for the database */
    static serialize(message: DiscordMessage<true>): Message {
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

    const referenceURL = messageLink(reference.channel_id, reference.id, reference.guild_id);
    const messageContent = await formatMessageContentForShortLog(reference.content, reference.sticker_id, referenceURL);

    const embed = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: "Reference" })
        .setFields([
            {
                name: "Author",
                value: userMentionWithId(reference.author_id)
            },
            {
                name: "Message Content",
                value: messageContent
            }
        ])
        .setTimestamp(reference.created_at);

    // Insert the reference embed at the beginning of the array
    embeds.unshift(embed);
}

// Escape code blocks, truncate the content if it's too long, and wrap it in a code block
export async function formatMessageContentForShortLog(content: string | null, stickerId: string | null, url: string | null): Promise<string> {
    let rawContent = url ? hyperlink("Jump to message", url) : "";

    if (stickerId) {
        const sticker = await client.fetchSticker(stickerId);

        if (sticker.format !== StickerFormatType.Lottie) {
            rawContent += ` \`|\` ${hyperlink(`Sticker: ${sticker.name}`, sticker.url)}`;
        } else {
            rawContent += ` \`|\` Lottie Sticker: ${sticker.name}`;
        }
    }

    if (content) {
        // Escape custom emojis
        content = content.replace(/<(a?):([^:\n\r]+):(\d{17,19})>/g, "<$1\\:$2\\:$3>");
        // Escape code blocks
        content = escapeCodeBlock(content);
        // Truncate the content if it's too long (account for the formatting characters)
        content = elipsify(content, EMBED_FIELD_CHAR_LIMIT - rawContent.length - 6);
    } else {
        content = EMPTY_MESSAGE_CONTENT;
    }

    return rawContent + codeBlock(content);
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


/** @returns An entry in the format: `[DD/MM/YYYY, HH:MM:SS] AUTHOR_ID — MESSAGE_CONTENT` */
export async function formatBulkMessageLogEntry(message: Message): Promise<string> {
    const timestamp = new Date(message.created_at).toLocaleString(undefined, LOG_ENTRY_DATE_FORMAT);
    let content: string | undefined;

    if (message.sticker_id) {
        const sticker = await client.fetchSticker(message.sticker_id).catch(() => null);

        if (sticker && sticker.format === StickerFormatType.Lottie) {
            content = `Sticker "${sticker.name}": Lottie`;
        } else if (sticker) {
            content = `Sticker "${sticker.name}": ${sticker.url}`;
        }
    }

    if (message.content && content) {
        content = ` | Message Content: ${message.content}`;
    }

    content ??= message.content ?? EMPTY_MESSAGE_CONTENT;

    return `[${timestamp}] ${message.author_id} — ${content}`;
}

/**
 * Tries to fetch the messages in the given channel,
 * if the message is not found in the channel, it will try to fetch it from the cache/database.
 *
 * @param channel - The channel to fetch the message from
 * @param messageId - The ID of the message to fetch
 */
export async function fetchMessage(messageId: Snowflake, channel: GuildTextBasedChannel): Promise<Message | null> {
    try {
        const message = await channel.messages.fetch(messageId);
        return Messages.serialize(message);
    } catch {
        return Messages.get(messageId);
    }
}

interface PurgeOptions {
    // The channel messages were purged from
    channelId: Snowflake;
    // The purged messages
    messages: Message[];
}

interface MessageDeleteAuditLog {
    // The user responsible for deleting the message
    executorId: Snowflake;
    // The author of the deleted message
    targetId: Snowflake;
    // The channel the message was deleted from
    channelId: Snowflake;
    // The time the message was deleted
    createdAt: Date;
    // The number of messages that were deleted
    count: number;
}