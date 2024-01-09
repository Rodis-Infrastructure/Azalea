import {
    Collection,
    Guild,
    GuildMember,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    PartialMessage
} from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { prisma } from "../index.ts";
import { CronJob } from "cron";
import { ConfigManager } from "./config.ts";

import Logger from "./logger.ts";

export class MessageCache {
    private static queue = new Collection<Snowflake, Message>();

    static async get(id: Snowflake): Promise<Message | null> {
        let message = this.queue.get(id) ?? null;

        if (!message) {
            message = await prisma.message.findUnique({
                where: {
                    message_id: id
                }
            });
        }

        return message;
    }

    static async set(message: DiscordMessage<true>): Promise<void> {
        const serializedMessage = prepareMessageForStorage(message);
        this.queue.set(message.id, serializedMessage);
    }

    static async delete(id: Snowflake): Promise<Message> {
        let message = MessageCache.queue.get(id);

        if (message) {
            message.deleted = true;
        } else {
            message = await prisma.message.delete({
                where: {
                    message_id: id
                }
            });
        }

        return message;
    }

    static async deleteMany(ids: Snowflake[]): Promise<Message[]> {
        const messages: Message[] = [];
        const uncachedMessageIds: Snowflake[] = [];

        for (const id in ids) {
            const message = MessageCache.queue.get(id);

            if (message) {
                messages.push(message);
            } else {
                uncachedMessageIds.push(id);
            }
        }

        return messages;
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

function prepareMessageForStorage(message: DiscordMessage<true>): Message {
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