import {
    codeBlock,
    Collection,
    Colors,
    EmbedBuilder,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    userMention
} from "discord.js";

import { EMPTY_MESSAGE_CONTENT } from "./constants.ts";
import { Snowflake } from "discord-api-types/v10";
import { ConfigManager } from "./config.ts";
import { Message } from "@prisma/client";
import { elipsify } from "./index.ts";
import { prisma } from "../index.ts";
import { CronJob } from "cron";

import Logger from "./logger.ts";

export class MessageCache {
    private static queue = new Collection<Snowflake, Message>();

    static async get(id: Snowflake): Promise<Message | null> {
        let message = this.queue.get(id) ?? null;

        if (!message) {
            message = await prisma.message.findUnique({
                where: { message_id: id }
            });
        }

        return message;
    }

    static set(message: DiscordMessage<true>): void {
        const serializedMessage = prepareMessageForStorage(message);
        this.queue.set(message.id, serializedMessage);
    }

    static async delete(id: Snowflake): Promise<Message | null> {
        let message = MessageCache.queue.get(id);

        if (message) {
            message.deleted = true;
        } else {
            message = await prisma.message.delete({ where: { message_id: id } });
        }

        return message;
    }

    static async deleteMany(messageCollection: Collection<Snowflake, PartialMessage | DiscordMessage<true>>): Promise<Message[]> {
        const ids = Array.from(messageCollection.keys());
        const messages = MessageCache.queue.filter(message =>
            ids.includes(message.message_id) && !message.deleted
        );

        const deletedMessages = messages.map(message => {
            message.deleted = true;
            return message;
        });

        // Update whatever wasn't cached in the database
        if (messages.size !== deletedMessages.length) {
            const dbDeletedMessages = await prisma.$queryRaw<Message[]>`
                DELETE
                FROM message
                WHERE message_id IN (${ids.join(",")}) RETURNING *;
            `;

            return deletedMessages.concat(dbDeletedMessages);
        }

        return deletedMessages;
    }

    // @returns The old content
    static async updateContent(id: Snowflake, newContent: string): Promise<string> {
        const message = MessageCache.queue.get(id);

        if (message) {
            const oldContent = message.content ?? EMPTY_MESSAGE_CONTENT;
            message.content = newContent;
            return oldContent;
        }

        const { old_content } = await prisma.$queryRaw<{ old_content: string | null }>`
            UPDATE message
            SET content = ${newContent}
            WHERE message_id = ${id} RETURNING (
                    SELECT content
                    FROM message
                    WHERE message_id = ${id}
                ) AS old_content;
        `;

        return old_content ?? EMPTY_MESSAGE_CONTENT;
    }

    // Clear the cache and store the messages in the database
    static async clear(): Promise<void> {
        Logger.info("Storing cached messages...");

        const insertPromises = MessageCache.queue.map(message =>
            prisma.message.create({ data: message }).catch(() => null)
        );

        await Promise.all(insertPromises);
        const insertedCount = this.queue.size;
        this.queue.clear();

        Logger.info(`Stored ${insertedCount} messages`);
    }

    // Start a cron job that will clear the cache and store the messages in the database
    static startCronJobs(): void {
        const cron = ConfigManager.globalConfig.database.messages.insert_cron;

        new CronJob(cron, async () => {
            await MessageCache.clear();
        }).start();
    }
}

// @returns Message object in a format appropriate for the database
export function prepareMessageForStorage(message: DiscordMessage<true>): Message {
    const stickerId = message.stickers.first()?.id ?? null;
    const referenceId = message.reference?.messageId ?? null;

    return {
        message_id: message.id,
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
        const cachedReference = await MessageCache.get(reference);
        if (!cachedReference) return;

        reference = cachedReference;
    }

    const referenceURL = messageLink(reference.channel_id, reference.message_id, reference.guild_id);
    const maskedJumpURL = hyperlink("Jump to message", referenceURL);

    const embed = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: "Reference" })
        .setDescription(maskedJumpURL)
        .setFields([
            {
                name: "Author",
                value: `${userMention(reference.author_id)} (\`${reference.author_id}\`)`
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
    if (!content) return "No message content";

    let formatted = content.replaceAll("```", "\\`\\`\\`");
    formatted = elipsify(formatted, 1000);

    return codeBlock(formatted);
}

// Ignores messages that were sent in DMs. This function shouldn't be used on deleted messages
export async function resolvePartialMessage(message: PartialMessage | DiscordMessage): Promise<DiscordMessage<true> | null> {
    const fetchedMessage = message.partial
        ? await message.fetch().catch(() => null)
        : message;

    if (!fetchedMessage?.inGuild()) return null;

    return fetchedMessage;
}