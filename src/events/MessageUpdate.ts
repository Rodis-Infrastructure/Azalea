import {
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
    resolvePartialMessage
} from "../utils/messages.ts";

import { GuildConfig, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageUpdateEventListener extends EventListener {
    constructor() {
        super(Events.MessageUpdate);
    }

    async execute(oldMessage: PartialMessage | DiscordMessage, newMessage: PartialMessage | DiscordMessage): Promise<void> {
        const message = await resolvePartialMessage(newMessage);
        let oldContent: string | null = null;

        // Continue if the message can't be fetched or if there is no content
        // e.g. message is a sticker
        if (!message || !message.content) return;

        // Only the message content is needed to proceed
        // A "partial" check is performed to avoid performing unnecessary operations (a message may have empty content)
        if (oldMessage.partial && !oldMessage.content) {
            oldContent = await MessageCache.get(oldMessage.id).then(m => m?.content ?? null);
        }

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        await handleMessageUpdateLog(message, oldContent, config);
    }
}

async function handleMessageUpdateLog(message: DiscordMessage<true>, oldContent: string | null, config: GuildConfig): Promise<void> {
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
            { name: "Content (Before)", value: formatMessageContentForLog(message.content) },
            { name: "Content (After)", value: formatMessageContentForLog(oldContent) }
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
        config,
        embeds
    });
}