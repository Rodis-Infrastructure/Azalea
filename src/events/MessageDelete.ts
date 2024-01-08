import { Colors, EmbedBuilder, Events, Message } from "discord.js";
import { Config, ConfigManager, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(message: Message<true>): Promise<void> {
        const config = ConfigManager.getConfig(message.guildId);
        if (!config) return;

        await handleMessageDeleteLog(message, config);
    }
}

async function handleMessageDeleteLog(message: Message<true>, config: Config): Promise<void> {
    if (!message.member) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setFields([
            { name: "Author", value: `${message.author} (\`${message.author.id}\`)` },
            { name: "Channel", value: `${message.channel} (\`#${message.channel.name}\`)` },
            { name: "Content", value: message.content }
        ])
        .setTimestamp(message.createdAt);

    await log(
        LoggingEvent.MessageDelete,
        config,
        message.channel,
        message.member,
        embed
    );
}