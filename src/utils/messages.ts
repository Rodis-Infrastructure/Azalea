import {
    codeBlock,
    Collection, Colors, EmbedBuilder,
    Guild,
    GuildMember,
    GuildTextBasedChannel, hyperlink,
    Message as DiscordMessage, messageLink,
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

    static async set(message: DiscordMessage<true>): Promise<void> {
        const serializedMessage = prepareMessageForStorage(message);
        this.queue.set(message.id, serializedMessage);
    }

    static async delete(id: Snowflake): Promise<Message | null> {
        let message = MessageCache.queue.get(id);

        if (message) {
            message.deleted = true;
        } else {
            message = await prisma.message.delete({
                where: { message_id: id }
            });
        }

        return message;
    }

    static async updateContent(id: Snowflake, newContent: string): Promise<void> {
        let message = MessageCache.queue.get(id);

        if (message) {
            message.content = newContent;
        } else {
            await prisma.message.update({
                where: { message_id: id },
                data: { content: newContent }
            });
        }
    }

    // Clear the buffer and store the messages in the database
    static async clear(): Promise<void> {
        Logger.info("Storing cached messages");

        const insertPromises = MessageCache.queue.map(message => {
            return prisma.message.create({ data: message });
        });

        await Promise.all(insertPromises);
        this.queue.clear();
    }

    static startClearInterval(): void {
        const crud = ConfigManager.globalConfig.database.messages.insert_crud;

        new CronJob(crud, async () => {
            await MessageCache.clear();
        });
    }
}

export async function fetchMessageReference(message: DiscordMessage<true>): Promise<Message | null> {
    if (!message.reference) return null;

    const reference = await message.fetchReference().catch(() => null);

    if (!reference && message.reference.messageId) {
        return MessageCache.get(message.reference.messageId);
    } else if (reference) {
        return prepareMessageForStorage(reference);
    }

    return null;
}

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
    }
}

export async function resolveMessage(message: PartialMessage | DiscordMessage<true>): Promise<Message | null> {
    if (message.partial) {
        const fetchedMessage = await message.fetch().catch(() => null) as DiscordMessage<true> | null;

        if (!fetchedMessage) {
            return MessageCache.get(message.id);
        }

        return prepareMessageForStorage(fetchedMessage);
    }

    return prepareMessageForStorage(message);
}

export async function fetchPartialData(guild: Guild, authorId: Snowflake, channelId: Snowflake): Promise<[GuildMember | null, GuildTextBasedChannel | null]> {
    let channel = await guild.channels.fetch(channelId).catch(() => null);
    const author = await guild.members.fetch(authorId).catch(() => null);

    if (!channel?.isTextBased() || channel?.isDMBased()) {
        channel = null;
    }

    return [author, channel];
}

export async function attachReferenceLog(referenceId: Snowflake, embeds: EmbedBuilder[]): Promise<void> {
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

export function formatMessageContentForLog(content: string | null): string {
    if (!content) return "No message content";

    let formatted = content.replaceAll("```", "\\`\\`\\`");
    formatted = elipsify(formatted, 1000);

    return codeBlock(formatted);
}