import {
    Collection,
    Events,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    PartialMessage,
    StickerFormatType,
    userMention
} from "discord.js";

import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log, mapLogEntriesToFile } from "../utils/logging.ts";
import { EMPTY_MESSAGE_CONTENT, LOG_ENTRY_DATE_FORMAT } from "../utils/constants.ts";
import { MessageCache } from "../utils/messages.ts";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { pluralize } from "../utils";
import { client } from "../index.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageBulkDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageBulkDelete);
    }

    async execute(deletedMessages: Collection<Snowflake, PartialMessage | DiscordMessage<true>>, channel: GuildTextBasedChannel): Promise<void> {
        const messages = await MessageCache.deleteMany(deletedMessages);
        const config = ConfigManager.getGuildConfig(channel.guild.id);

        if (!messages.length || !config) return;

        await handleMessageBulkDeleteLog(messages, channel, config);
    }
}

export async function handleMessageBulkDeleteLog(messages: Message[], channel: GuildTextBasedChannel, config: GuildConfig): Promise<void> {
    const authorMentions: ReturnType<typeof userMention>[] = [];
    const entries: string[] = [];

    // Format message log entries
    for (const message of messages) {
        const authorMention = userMention(message.author_id);
        const messageEntry = await formatMessageLogEntry(message);
        const subEntries = [messageEntry];

        if (!authorMentions.includes(authorMention)) {
            authorMentions.push(authorMention);
        }

        if (message.reference_id) {
            const reference = await MessageCache.get(message.reference_id);

            if (reference) {
                const referenceEntry = await formatMessageLogEntry(reference);
                subEntries.unshift(`REF: ${referenceEntry}`);
            }
        }

        entries.push(subEntries.join("\n └── "));
    }

    // E.g. Deleted `5` messages in #general by @user1, @user2
    const logContent = `Deleted \`${messages.length}\` ${pluralize(messages.length, "message")} in ${channel} by ${authorMentions.join(", ")}`;
    const file = mapLogEntriesToFile(entries);

    await log({
        event: LoggingEvent.MessageBulkDelete,
        message: {
            allowedMentions: { parse: [] },
            content: logContent,
            files: [file]
        },
        channel,
        config
    });
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