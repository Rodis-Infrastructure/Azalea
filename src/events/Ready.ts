import { components } from "../handlers/components/ComponentManager.ts";
import { commands } from "../handlers/commands/CommandManager.ts";
import { ConfigManager } from "../utils/config.ts";
import { Client, Events } from "discord.js";

import Logger, { AnsiColor } from "../utils/logger.ts";
import EventListener from "../handlers/events/EventListener.ts";
import { MessageCache } from "../utils/messages.ts";

export default class Ready extends EventListener {
    constructor() {
        super(Events.ClientReady, {
            once: true
        });
    }

    async execute(client: Client<true>): Promise<void> {
        Logger.log("READY", `Successfully logged in as ${client.user.tag}`, {
            color: AnsiColor.Green,
            fullColor: true
        });

        ConfigManager.loadGlobalConfig();

        await Promise.all([
            ConfigManager.loadGuildConfigs(),
            components.register(),
            commands.register()
        ]);

        await commands.publish();

        // Operations that require the global config
        MessageCache.startClearInterval();
    }
}