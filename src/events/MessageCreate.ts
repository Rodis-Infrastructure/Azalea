import { Events, Message, PartialMessage } from "discord.js";

import EventListener from "../handlers/events/EventListener.ts";
import { resolvePartialMessage, MessageCache } from "../utils/messages.ts";

export default class MessageCreateEventListener extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(newMessage: PartialMessage | Message): Promise<void> {
        const message = await resolvePartialMessage(newMessage);
        if (!message || message.author.bot) return;

        MessageCache.set(message);
    }
}