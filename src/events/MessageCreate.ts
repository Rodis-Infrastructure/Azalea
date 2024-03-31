import { MessageCache, resolvePartialMessage } from "@utils/messages";
import { handleModerationRequest } from "@utils/requests";
import { Events, Message, PartialMessage } from "discord.js";

import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class MessageCreateEventListener extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(newMessage: PartialMessage | Message): Promise<void> {
        const message = await resolvePartialMessage(newMessage);
        if (!message || message.author.bot) return;

        MessageCache.set(message);

        const config = ConfigManager.getGuildConfig(message.guild.id);
        if (!config) return;

        // Source channel conditions are handled within the function
        await handleModerationRequest(message, config);
    }
}