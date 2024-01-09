import {
    channelMention,
    Colors,
    EmbedBuilder,
    Events,
    Message as DiscordMessage,
    PartialMessage,
    userMention
} from "discord.js";

import EventListener from "../handlers/events/EventListener.ts";

import { Config, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { fetchPartialData, resolveMessage } from "../utils/messages.ts";
import { log } from "../utils/logging.ts";
import { Message } from "@prisma/client";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: PartialMessage | DiscordMessage<true>): Promise<void> {
        const message = await resolveMessage(deletedMessage);
        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guild_id);
        if (!config) return;

        await handleMessageDeleteLog(message, config);
    }
}

async function handleMessageDeleteLog(message: Message, config: Config): Promise<void> {
    const [author, sourceChannel] = await fetchPartialData(config.guild, message.author_id, message.channel_id);
    if (!author || !sourceChannel) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setFields([
            { name: "Author", value: `${userMention(message.author_id)} (\`${message.author_id}\`)` },
            { name: "Channel", value: `${channelMention(sourceChannel.id)} (\`#${sourceChannel.name}\`)` },
            { name: "Content", value: message.content }
        ])
        .setTimestamp(message.created_at);

    await log(
        LoggingEvent.MessageDelete,
        config,
        sourceChannel,
        author,
        embed
    );
}