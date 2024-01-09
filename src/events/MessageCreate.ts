import { Events, Message, PartialMessage } from "discord.js";

import EventListener from "../handlers/events/EventListener.ts";
import { MessageCache } from "../utils/messages.ts";

export default class MessageCreateEventListener extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(newMessage: PartialMessage | Message<true>): Promise<void> {
        let message!: Message<true>;

        if (newMessage.partial) {
            message = await newMessage.fetch() as Message<true>;
        } else {
            message = newMessage;
        }

        await MessageCache.set(message);
    }
}