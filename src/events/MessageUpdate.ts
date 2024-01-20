import {
    AttachmentBuilder,
    Colors,
    EmbedBuilder,
    Events,
    hyperlink,
    Message as DiscordMessage,
    PartialMessage
} from "discord.js";

import {
    prependReferenceLog,
    formatMessageContentForLog,
    MessageCache,
    resolvePartialMessage, prepareMessageForStorage
} from "../utils/messages.ts";

import { GuildConfig, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";
import { Message } from "@prisma/client";
import { formatMessageLogEntry } from "./MessageBulkDelete.ts";

export default class MessageUpdateEventListener extends EventListener {
    constructor() {
        super(Events.MessageUpdate);
    }

    async execute(oldMessage: PartialMessage | DiscordMessage, newMessage: PartialMessage | DiscordMessage): Promise<void> {
        const message = await resolvePartialMessage(newMessage);
        let oldContent = oldMessage.content ?? "No message content";

        // Continue if the message can't be fetched or if there is no content
        // e.g. message is a sticker
        if (!message || !message.content) return;

        // Only the message content is needed to proceed
        // A "partial" check is performed to avoid performing unnecessary operations (a message may have empty content)
        if (oldMessage.partial && !oldMessage.content) {
            oldContent = await MessageCache.get(oldMessage.id).then(m => m?.content ?? oldContent);
        }

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        if (oldContent.length <= 1000 && message.content.length <= 1000) {
            await handleMessageUpdateLog(message, oldContent, config);
        } else {
            await handleLongMessageUpdateLog(message, oldContent, config);
        }
    }
}

async function handleMessageUpdateLog(message: DiscordMessage<true>, oldContent: string, config: GuildConfig): Promise<void> {
    // Member roles are required to perform scope checks
    if (!message.member) return;

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

    if (message.reference?.messageId) {
        await prependReferenceLog(message.reference.messageId, embeds);
    }

    await log({
        event: LoggingEvent.MessageUpdate,
        channel: message.channel,
        member: message.member,
        message: { embeds },
        config
    });
}

async function handleLongMessageUpdateLog(message: DiscordMessage<true>, oldContent: string, config: GuildConfig): Promise<void> {
    const serializedMessage = prepareMessageForStorage(message);
    let entry = "";

    if (message.reference?.messageId) {
        const reference = await MessageCache.get(message.reference.messageId);

        if (reference) {
            entry = await formatMessageUpdateReferenceLogEntry(serializedMessage, oldContent, reference);
        }
    }

    if (!entry) {
        entry = await formatMessageUpdateLogEntry(serializedMessage, oldContent);
    }

    const buffer = Buffer.from(entry);
    const file = new AttachmentBuilder(buffer, { name: "message_update.txt" });
    const maskedJumpURL = hyperlink("Jump to message", `<${message.url}>`);
    const logContent = `Updated message in ${message.channel} by ${message.author} (${maskedJumpURL})`;

    await log({
        event: LoggingEvent.MessageUpdate,
        message: {
            allowedMentions: { parse: [] },
            content: logContent,
            files: [file]
        },
        channel: message.channel,
        member: message.member,
        config
    });
}

async function formatMessageUpdateLogEntry(message: Message, oldContent: string): Promise<string> {
    const [oldMessageEntry, newMessageEntry] = await Promise.all([
        formatMessageLogEntry({ ...message, content: oldContent }),
        formatMessageLogEntry({ ...message, created_at: new Date() })
    ]);

    return `BEFORE: ${oldMessageEntry}\nAFTER: ${newMessageEntry}`;
}

async function formatMessageUpdateReferenceLogEntry(message: Message, oldContent: string, reference: Message): Promise<string> {
    const [oldMessageEntry, newMessageEntry, referenceEntry] = await Promise.all([
        formatMessageLogEntry({ ...message, content: oldContent }),
        formatMessageLogEntry({ ...message, created_at: new Date() }),
        formatMessageLogEntry(reference)
    ]);

    return `REF: ${referenceEntry}\n └── A: ${oldMessageEntry}\n └── B: ${newMessageEntry}`;
}