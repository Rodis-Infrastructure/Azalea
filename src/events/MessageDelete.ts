import {
    channelMention,
    Colors,
    EmbedBuilder,
    Events,
    Message as DiscordMessage,
    PartialMessage,
    userMention
} from "discord.js";

import {
    prependReferenceLog,
    fetchPartialMessageData, formatMessageContentForLog,
    MessageCache,
    prepareMessageForStorage
} from "../utils/messages.ts";

import { GuildConfig, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";
import { Message } from "@prisma/client";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: PartialMessage | DiscordMessage): Promise<void> {
        let message: Message | null = null;

        if (deletedMessage.partial) {
            message = await MessageCache.delete(deletedMessage.id);
        } else if (deletedMessage.inGuild()) {
            message = prepareMessageForStorage(deletedMessage);
        }

        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guild_id);
        if (!config) return;

        await handleMessageDeleteLog(message, config);
    }
}

async function handleMessageDeleteLog(message: Message, config: GuildConfig): Promise<void> {
    const [author, sourceChannel] = await fetchPartialMessageData(config.guild, message.author_id, message.channel_id);

    // Member roles and the source channel are required to perform scope checks
    if (!author || !sourceChannel) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setFields([
            { name: "Author", value: `${userMention(message.author_id)} (\`${message.author_id}\`)` },
            { name: "Channel", value: `${channelMention(sourceChannel.id)} (\`#${sourceChannel.name}\`)` },
            { name: "Content", value: formatMessageContentForLog(message.content) }
        ])
        .setTimestamp(message.created_at);

    const embeds = [embed];

    if (message.reference_id) {
        await prependReferenceLog(message.reference_id, embeds);
    }

    await log({
        event: LoggingEvent.MessageDelete,
        channel: sourceChannel,
        member: author,
        config,
        embeds
    });
}