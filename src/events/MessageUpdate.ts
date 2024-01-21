import {
    Colors,
    EmbedBuilder,
    Events,
    hyperlink,
    Message as DiscordMessage,
    MessageCreateOptions,
    PartialMessage
} from "discord.js";

import {
    prependReferenceLog,
    formatMessageContentForLog,
    MessageCache,
    resolvePartialMessage,
    prepareMessageForStorage
} from "../utils/messages.ts";

import { GuildConfig, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { EMBED_FIELD_CHAR_LIMIT } from "../utils/constants.ts";
import { formatMessageLogEntry } from "./MessageBulkDelete.ts";
import { log, mapLogEntriesToFile } from "../utils/logging.ts";
import { Message } from "@prisma/client";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageUpdateEventListener extends EventListener {
    constructor() {
        super(Events.MessageUpdate);
    }

    async execute(_oldMessage: never, newMessage: PartialMessage | DiscordMessage): Promise<void> {
        const message = await resolvePartialMessage(newMessage);

        // Continue if the message can't be fetched or if there is no content
        // e.g. message is a sticker
        if (!message || !message.content) return;

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        await handleMessageUpdateLog(message, config).catch(() => null);
    }
}

async function handleMessageUpdateLog(message: DiscordMessage<true>, config: GuildConfig): Promise<void> {
    const reference = message.reference?.messageId
        ? await MessageCache.get(message.reference.messageId)
        : null;

    const oldContent = await MessageCache.updateContent(message.id, message.content);
    if (oldContent === message.content) return;

    let logContent: MessageCreateOptions | null;

    if (
        oldContent.length > EMBED_FIELD_CHAR_LIMIT ||
        message.content.length > EMBED_FIELD_CHAR_LIMIT ||
        (reference?.content && reference.content.length > EMBED_FIELD_CHAR_LIMIT)
    ) {
        logContent = await getLongMessageUpdateLogContent(message, reference, oldContent);
    } else {
        logContent = await getShortMessageUpdateLogContent(message, reference, oldContent);
    }

    if (!logContent) return;

    await log({
        event: LoggingEvent.MessageUpdate,
        message: logContent,
        channel: message.channel,
        config
    });
}

// @returns The log message
async function getShortMessageUpdateLogContent(
    message: DiscordMessage<true>,
    reference: Message | null,
    oldContent: string
): Promise<MessageCreateOptions | null> {
    const maskedJumpURL = hyperlink("Jump to message", message.url);
    const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setAuthor({ name: "Message Updated" })
        .setDescription(maskedJumpURL)
        .setFields([
            { name: "Author", value: `${message.author} (\`${message.author.id}\`)` },
            { name: "Channel", value: `${message.channel} (\`#${message.channel.name}\`)` },
            { name: "Content (Before)", value: formatMessageContentForLog(oldContent) },
            { name: "Content (After)", value: formatMessageContentForLog(message.content) }
        ])
        .setTimestamp();

    const embeds = [embed];

    if (reference) {
        await prependReferenceLog(reference, embeds);
    }

    return { embeds };
}

// @returns The log message
async function getLongMessageUpdateLogContent(
    message: DiscordMessage<true>,
    reference: Message | null,
    oldContent: string
): Promise<MessageCreateOptions | null> {
    const serializedMessage = prepareMessageForStorage(message);
    const entry = await formatMessageUpdateLogEntry(serializedMessage, reference, oldContent);
    const file = mapLogEntriesToFile([entry]);
    const maskedJumpURL = hyperlink("Jump to message", `<${message.url}>`);

    return {
        content: `Updated message in ${message.channel} by ${message.author} (${maskedJumpURL})`,
        allowedMentions: { parse: [] },
        files: [file]
    };
}

async function formatMessageUpdateLogEntry(message: Message, reference: Message | null, oldContent: string): Promise<string> {
    const [oldMessageEntry, newMessageEntry] = await Promise.all([
        formatMessageLogEntry({ ...message, content: oldContent }),
        formatMessageLogEntry({ ...message, created_at: new Date() })
    ]);

    const entries = [
        `A: ${oldMessageEntry}`,
        `B: ${newMessageEntry}`
    ];

    if (reference) {
        const referenceEntry = await formatMessageLogEntry(reference);
        entries.unshift(`REF: ${referenceEntry}`);
    }

    // There is no reference
    if (entries.length === 2) {
        return entries.join("\n");
    }

    // There is a reference
    return entries.join("\n └── ");
}