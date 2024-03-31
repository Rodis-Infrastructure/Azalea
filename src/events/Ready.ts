import { MessageCache } from "@utils/messages";
import { Client, Events } from "discord.js";

import Logger, { AnsiColor } from "@utils/logger";
import EventListener from "@managers/events/EventListener";

export default class Ready extends EventListener {
    constructor() {
        super(Events.ClientReady, {
            once: true
        });
    }

    execute(client: Client<true>): void {
        Logger.log("READY", `Successfully logged in as ${client.user.tag}`, {
            color: AnsiColor.Green,
            full: true
        });

        // Operations that require the global config
        MessageCache.startCronJobs();
    }
}