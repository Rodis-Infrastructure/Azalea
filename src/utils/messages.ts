import {
    Collection,
    Colors,
    EmbedBuilder,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    StickerFormatType
} from "discord.js";

import { EMBED_FIELD_CHAR_LIMIT, EMPTY_MESSAGE_CONTENT, LOG_ENTRY_DATE_FORMAT } from "./constants";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { elipsify, pluralize, userMentionWithId } from "./index";
import { client, prisma } from "./..";
import { CronJob } from "cron";

import Logger from "./logger";
import ConfigManager from "@managers/config/ConfigManager";

export class Messages {
    // Cache for messages that haven't been stored in the database yet
    private static dbQueue = new Collection<Snowflake, Message>();
    // Queue for messages that need to be purged
    static purgeQueue: PurgeOptions[] = [];

    static async get(id: Snowflake): Promise<Message | null> {
        let message = this.dbQueue.get(id) ?? null;

        if (!message) {
            message = await prisma.message.findUnique({ where: { id } });
        }

        return message;
    }

    /**
     * Get a user's messages from cache or the database
     *
     * @param userId - The target user's ID
     * @param channelId - The source channel's ID
     * @param limit - The maximum number of messages to return
     */
    static async getByUser(userId: Snowflake, channelId: Snowflake, limit: number): Promise<Message[]> {
        // Get cached non-deleted messages by the specified user in the specified channel
        const cachedMessages = this.dbQueue.filter(message =>
            message.author_id === userId &&
            message.channel_id === channelId &&
            !message.deleted
        );

        const messages = Array.from(cachedMessages.values());

        // Fetch remaining messages from the database if an insufficient amount was cached
        if (messages.length < limit) {
            const stored = await prisma.$queryRaw<Message[]>`
                SELECT *
                FROM message
                WHERE author_id = ${userId}
                  AND channel_id = ${channelId}
                  AND deleted = false
                ORDER BY created_at DESC
                    LIMIT ${limit - messages.length};
            `;

            // Combined cached and stored messages
            return messages.concat(stored);
        }

        return messages;
    }

    static set(message: DiscordMessage<true>): void {
        const serializedMessage = prepareMessageForStorage(message);
        this.dbQueue.set(message.id, serializedMessage);
    }

    /**
     * Update the deletion state of a message
     * @param id - ID of the message to delete
     */
    static async delete(id: Snowflake): Promise<Message | null> {
        // Try to get the message form cache
        let message = this.dbQueue.get(id) ?? null;

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
        const messages = this.dbQueue.filter(message =>
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
                UPDATE message
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
        const message = this.dbQueue.get(id);

        // Modify the cache if the message is cached
        if (message) {
            const oldContent = message.content ?? EMPTY_MESSAGE_CONTENT;
            message.content = newContent;

            return oldContent;
        }

        // Update the message in the database
        const { old_content } = await prisma.$queryRaw<{ old_content: string | null }>`
            UPDATE message
            SET content = ${newContent}
            WHERE id = ${id} RETURNING (
                    SELECT content
                    FROM message
                    WHERE id = ${id}
                ) AS old_content;
        `;

        return old_content ?? EMPTY_MESSAGE_CONTENT;
    }

    // Clear the cache and store the messages in the database
    static async clear(): Promise<void> {
        Logger.info("Storing cached messages...");

        // Insert all cached messages into the database
        const insertPromises = this.dbQueue.map(message =>
            prisma.message.create({ data: message }).catch(() => null)
        );

        await Promise.all(insertPromises);
        const insertedCount = this.dbQueue.size;

        // Empty the cache
        this.dbQueue.clear();

        Logger.info(`Stored ${insertedCount} ${pluralize(insertedCount, "message")}`);
    }

    // Start a cron job that will clear the cache and store the messages in the database
    static startDbStorageCronJob(): void {
        const cron = ConfigManager.globalConfig.database.messages.insert_cron;

        new CronJob(cron, async () => {
            await this.clear();
        }).start();
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
        category_id: message.channel.parentId,
        sticker_id: stickerId,
        reference_id: referenceId,
        deleted: false
    };
}

// Prepend a reference embed to an embed array passed by reference
export async function prependReferenceLog(reference: Snowflake | Message, embeds: EmbedBuilder[]): Promise<void> {
    // Fetch the reference if an ID is passed
    if (typeof reference === "string") {
        const cachedReference = await Messages.get(reference);
        if (!cachedReference) return;

        reference = cachedReference;
    }

    const referenceURL = messageLink(reference.channel_id, reference.id, reference.guild_id);
    const maskedJumpURL = hyperlink("Jump to message", referenceURL);

    const embed = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: "Reference" })
        .setDescription(maskedJumpURL)
        .setFields([
            {
                name: "Author",
                value: userMentionWithId(reference.author_id)
            },
            {
                name: "Content",
                value: formatMessageContentForLog(reference.content)
            }
        ])
        .setTimestamp(reference.created_at);

    // Insert the reference embed at the beginning of the array
    embeds.unshift(embed);
}

// Escape code blocks, truncate the content if it's too long, and wrap it in a code block
export function formatMessageContentForLog(content: string | null): string {
    return elipsify(content || EMPTY_MESSAGE_CONTENT, EMBED_FIELD_CHAR_LIMIT);
}

// Ignores messages that were sent in DMs. This function shouldn't be used on deleted messages
export async function resolvePartialMessage(message: PartialMessage | DiscordMessage): Promise<DiscordMessage<true> | null> {
    const fetchedMessage = message.partial
        ? await message.fetch().catch(() => null)
        : message;

    if (!fetchedMessage?.inGuild()) return null;

    return fetchedMessage;
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
    });

    setTimeout(async () => {
        await reply.delete().catch(() => null);
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