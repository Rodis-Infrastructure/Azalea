import {
    codeBlock,
    Collection,
    Colors,
    EmbedBuilder,
    Guild,
    GuildMember,
    GuildTextBasedChannel,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage
} from "discord.js";

import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { prisma } from "../index.ts";
import { CronJob } from "cron";
import { ConfigManager } from "./config.ts";
import { elipsify } from "./index.ts";

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

    static async deleteMany(ids: Snowflake[]): Promise<Message[]> {
        const messages = MessageCache.queue.filter(message =>
            ids.includes(message.message_id) && !message.deleted
        );

        const deletedMessages = messages.map(message => {
            message.deleted = true;
            return message;
        });

        // Update whatever wasn't cached in the database
        const dbDeletedMessages = await prisma.$queryRaw<Message[]>`
            DELETE
            FROM messages
            WHERE message_id IN (${ids.join(",")}) RETURNING *;
        `;

        return deletedMessages.concat(dbDeletedMessages);
    }

    static async updateContent(id: Snowflake, newContent: string): Promise<void> {
        const message = MessageCache.queue.get(id);

        if (message) {
            message.content = newContent;
        } else {
            await prisma.message.update({
                where: { message_id: id },
                data: { content: newContent }
            });
        }
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

export async function fetchPartialMessageData(guild: Guild, authorId: Snowflake, channelId: Snowflake): Promise<[GuildMember | null, GuildTextBasedChannel | null]> {
    let channel = await guild.channels.fetch(channelId).catch(() => null);
    const author = await guild.members.fetch(authorId).catch(() => null);

    if (!channel?.isTextBased() || channel.isDMBased()) {
        channel = null;
    }

    return [author, channel];
}

// Prepend a reference embed to an embed array passed by reference
export async function prependReferenceLog(referenceId: Snowflake, embeds: EmbedBuilder[]): Promise<void> {
    const reference = await MessageCache.get(referenceId);
    if (!reference) return;

    const referenceURL = messageLink(reference.channel_id, reference.message_id, reference.guild_id);
    const maskedJumpURL = hyperlink("Jump to message", referenceURL);

    const embed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setAuthor({ name: "Reference" })
        .setDescription(maskedJumpURL)
        .setFields([
            {
                name: "Author",
                value: `${reference.author_id} (\`${reference.author_id}\`)`
            },
            {
                name: "Content",
                value: reference.content
            }
        ])
        .setTimestamp(reference.created_at);

    // Insert the reference embed at the beginning of the array
    embeds.splice(0, 0, embed);
}

// Escape code blocks, truncate the content if it's too long, and wrap it in a code block
export function formatMessageContentForLog(content: string | null): string {
    if (!content) return "No message content";

    let formatted = content.replaceAll("```", "\\`\\`\\`");
    formatted = elipsify(formatted, 1000);

    return codeBlock(formatted);
}

// Ignores messages that were sent in DMs
// This function shouldn't be used on deleted messages
export async function resolvePartialMessage(message: PartialMessage | DiscordMessage): Promise<DiscordMessage<true> | null> {
    const fetchedMessage = message.partial
        ? await message.fetch().catch(() => null)
        : message;

    if (!fetchedMessage?.inGuild()) return null;

    return fetchedMessage;
}