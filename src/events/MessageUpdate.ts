import { Colors, EmbedBuilder, Events, Message as DiscordMessage, PartialMessage } from "discord.js";
import { attachReferenceLog, formatMessageContentForLog, MessageCache } from "../utils/messages.ts";
import { Config, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

class MessageUpdateEventListener extends EventListener {
    constructor() {
        super(Events.MessageUpdate);
    }

    async execute(oldMessage: PartialMessage | DiscordMessage<true>, newMessage: PartialMessage | DiscordMessage<true>): Promise<void> {
        let message!: DiscordMessage<true> | null;
        let oldContent!: string | null;

        if (newMessage.partial) {
            message = await newMessage.fetch().catch(() => null) as DiscordMessage<true> | null;
        }

        // Continue if the message can't be fetched or if there is no content
        // e.g. message is a sticker
        if (!message || !message.content) return;

        if (oldMessage.partial && !oldMessage.content) {
            oldContent = await MessageCache.get(oldMessage.id).then(m => m?.content ?? null);
        }

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        await handleMessageUpdateLog(message, oldContent, config);
    }
}

async function handleMessageUpdateLog(message: DiscordMessage<true>, oldContent: string | null, config: Config): Promise<void> {
    if (!message.member) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setAuthor({ name: "Message Updated" })
        .setFields([
            { name: "Author", value: `${message.author} (\`${message.author.id}\`)` },
            { name: "Channel", value: `${message.channel} (\`#${message.channel.name}\`)` },
            { name: "Content (Before)", value: formatMessageContentForLog(message.content) },
            { name: "Content (After)", value: formatMessageContentForLog(oldContent) }
        ])
        .setTimestamp();

    const embeds = [embed];

    if (message.reference?.messageId) {
        await attachReferenceLog(message.reference?.messageId, embeds);
    }

    await log({
        event: LoggingEvent.MessageUpdate,
        channel: message.channel,
        member: message.member,
        config,
        embeds
    });
}