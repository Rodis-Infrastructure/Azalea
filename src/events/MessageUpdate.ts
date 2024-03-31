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
} from "@utils/messages";

import { formatMessageLogEntry } from "./MessageBulkDelete";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { handleModerationRequest } from "@utils/requests";
import { Message } from "@prisma/client";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class MessageUpdateEventListener extends EventListener {
    constructor() {
        super(Events.MessageUpdate);
    }

    async execute(_oldMessage: never, newMessage: PartialMessage | DiscordMessage): Promise<void> {
        const message = await resolvePartialMessage(newMessage);

        // Terminate if the message can't be fetched or if there is no content
        // e.g. message is a sticker
        if (!message || !message.content || message.author.bot) return;

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        this.handleMessageUpdateLog(message, config).catch(() => null);
        await handleModerationRequest(message, config).catch(() => null);
    }

    async handleMessageUpdateLog(message: DiscordMessage<true>, config: GuildConfig): Promise<void> {
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
            logContent = await this.getLongLogContent(message, reference, oldContent);
        } else {
            logContent = await this.getShortLogContent(message, reference, oldContent);
        }

        if (!logContent) return;

        log({
            event: LoggingEvent.MessageUpdate,
            message: logContent,
            channel: message.channel,
            config
        });
    }

    /** @returns The log message */
    async getShortLogContent(
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

    /** @returns The log message */
    async getLongLogContent(
        message: DiscordMessage<true>,
        reference: Message | null,
        oldContent: string
    ): Promise<MessageCreateOptions | null> {
        const serializedMessage = prepareMessageForStorage(message);
        const entry = await this.formatLogEntry(serializedMessage, reference, oldContent);
        const file = mapLogEntriesToFile([entry]);
        const maskedJumpURL = hyperlink("Jump to message", `<${message.url}>`);

        return {
            content: `Updated message in ${message.channel} by ${message.author} (${maskedJumpURL})`,
            allowedMentions: { parse: [] },
            files: [file]
        };
    }

    async formatLogEntry(message: Message, reference: Message | null, oldContent: string): Promise<string> {
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
}