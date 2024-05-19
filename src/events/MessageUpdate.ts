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
    Messages,
    prepareMessageForStorage,
    formatMessageLogEntry
} from "@utils/messages";

import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { handleModerationRequest } from "@utils/requests";
import { Message } from "@prisma/client";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class MessageUpdate extends EventListener {
    constructor() {
        super(Events.MessageUpdate);
    }

    async execute(_oldMessage: never, newMessage: PartialMessage | DiscordMessage<true>): Promise<void> {
        const message = newMessage.partial
            ? await newMessage.fetch().catch(() => null) as DiscordMessage<true> | null
            : newMessage;

        // Terminate if the message can't be fetched or if there is no content
        if (!message || message.author.bot || !message.content) return;

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        const oldContent = await Messages.updateContent(message.id, message.content);
        // Only proceed if the message content was changed
        if (oldContent === message.content) return;

        MessageUpdate._log(message, oldContent, config).catch(() => null);
        handleModerationRequest(message, config);
    }

    private static async _log(message: DiscordMessage<true>, oldContent: string, config: GuildConfig): Promise<void> {
        const reference = message.reference?.messageId
            ? await Messages.get(message.reference.messageId)
            : null;

        let logContent: MessageCreateOptions | null;

        if (
            oldContent.length > EMBED_FIELD_CHAR_LIMIT ||
            message.content.length > EMBED_FIELD_CHAR_LIMIT ||
            (reference?.content && reference.content.length > EMBED_FIELD_CHAR_LIMIT)
        ) {
            logContent = await MessageUpdate._getLongLogContent(message, reference, oldContent);
        } else {
            logContent = await MessageUpdate._getShortLogContent(message, reference, oldContent);
        }

        if (!logContent) return;

        log({
            event: LoggingEvent.MessageUpdate,
            message: logContent,
            channel: message.channel,
            config
        });
    }

    // @returns The log message
    private static async _getShortLogContent(
        message: DiscordMessage<true>,
        reference: Message | null,
        oldContent: string
    ): Promise<MessageCreateOptions | null> {
        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setAuthor({ name: "Message Updated" })
            .setFields([
                { name: "Author", value: `${message.author} (\`${message.author.id}\`)` },
                { name: "Channel", value: `${message.channel} (\`#${message.channel.name}\`)` },
                { name: "Content (Before)", value: await formatMessageContentForLog(oldContent, null, message.url) },
                { name: "Content (After)", value: await formatMessageContentForLog(message.content, null, message.url) }
            ])
            .setTimestamp();

        const embeds = [embed];

        if (reference) {
            await prependReferenceLog(reference, embeds);
        }

        return { embeds };
    }

    // @returns The log message
    private static async _getLongLogContent(
        message: DiscordMessage<true>,
        reference: Message | null,
        oldContent: string
    ): Promise<MessageCreateOptions | null> {
        const serializedMessage = prepareMessageForStorage(message);
        const entry = await MessageUpdate._formatLogEntry(serializedMessage, reference, oldContent);
        const file = mapLogEntriesToFile([entry]);
        const maskedJumpURL = hyperlink("Jump to message", `<${message.url}>`);

        return {
            content: `Updated message in ${message.channel} by ${message.author} (${maskedJumpURL})`,
            allowedMentions: { parse: [] },
            files: [file]
        };
    }

    private static async _formatLogEntry(message: Message, reference: Message | null, oldContent: string): Promise<string> {
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