import {
    AttachmentBuilder,
    Collection,
    Events,
    GuildMember,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    PartialMessage,
    StickerFormatType,
    userMention
} from "discord.js";

import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { MessageCache } from "../utils/messages.ts";
import { Snowflake } from "discord-api-types/v10";
import { log } from "../utils/logging.ts";
import { Message } from "@prisma/client";
import { pluralize } from "../utils";
import { client } from "../index.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageBulkDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageBulkDelete);
    }

    async execute(deletedMessages: Collection<Snowflake, PartialMessage | DiscordMessage<true>>, channel: GuildTextBasedChannel): Promise<void> {
        const messageIds = Array.from(deletedMessages.keys());
        const messages = await MessageCache.deleteMany(messageIds);
        const config = ConfigManager.getGuildConfig(channel.guild.id);

        if (!messages.length || !config) return;

        await handleMessageBulkDeleteLog(messages, channel, config);
    }
}

export async function handleMessageBulkDeleteLog(messages: Message[], channel: GuildTextBasedChannel, config: GuildConfig): Promise<void> {
    let member: GuildMember | null = null;

    const authorIdSet = new Set<Snowflake>();
    const entries: string[] = [];

    // Format message log entries
    for (const message of messages) {
        authorIdSet.add(message.author_id);

        if (message.reference_id) {
            const reference = await MessageCache.get(message.reference_id);

            if (reference) {
                const entry = await formatMessageDeleteReferenceLogEntry(message, reference);
                entries.push(entry);
                continue;
            }
        }

        const entry = await formatMessageLogEntry(message);
        entries.push(entry);
    }

    const authorIds = Array.from(authorIdSet.values());

    if (authorIds.length === 1) {
        member = await channel.guild.members.fetch(authorIds[0]);
    }

    const buffer = Buffer.from(entries.join("\n\n"));
    const file = new AttachmentBuilder(buffer, { name: "messages.txt" });
    const authorMentions = authorIds.map(id => userMention(id)).join(", ");
    const logContent = `Deleted \`${messages.length}\` ${pluralize(messages.length, "message")} in ${channel} by ${authorMentions}`;

    await log({
        event: LoggingEvent.MessageBulkDelete,
        message: {
            allowedMentions: { parse: [] },
            content: logContent,
            files: [file]
        },
        channel,
        config,
        member
    });
}

// Returns an entry in the format: `[DD/MM/YYYY, HH:MM:SS] AUTHOR_ID — MESSAGE_CONTENT`
export async function formatMessageLogEntry(message: Message): Promise<string> {
    let content = message.content;

    const timestamp = new Date(message.created_at).toLocaleString(undefined, {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });

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

async function formatMessageDeleteReferenceLogEntry(message: Message, reference: Message): Promise<string> {
    const [messageEntry, referenceEntry] = await Promise.all([
        formatMessageLogEntry(message),
        formatMessageLogEntry(reference)
    ]);

    return `REF: ${referenceEntry}\n └── ${messageEntry}`;
}