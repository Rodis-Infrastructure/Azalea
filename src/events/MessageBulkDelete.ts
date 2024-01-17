import { Events, PartialMessage, Message as DiscordMessage, GuildTextBasedChannel, Collection } from "discord.js";
import { ConfigManager, GuildConfig } from "../utils/config.ts";
import { MessageCache } from "../utils/messages.ts";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";

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

async function handleMessageBulkDeleteLog(messages: Message[], channel: GuildTextBasedChannel, config: GuildConfig): Promise<void> {
    // TODO
}