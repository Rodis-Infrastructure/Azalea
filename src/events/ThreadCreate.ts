import { Colors, EmbedBuilder, Events, ThreadChannel, userMention } from "discord.js";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class ThreadCreateEventListener extends EventListener {
    constructor() {
        super(Events.ThreadCreate);
    }

    async execute(thread: ThreadChannel): Promise<void> {
        const config = ConfigManager.getGuildConfig(thread.guildId);
        if (!config) return;

        await handleThreadCreateLog(thread, config);
    }
}

async function handleThreadCreateLog(thread: ThreadChannel, config: GuildConfig): Promise<void> {
    if (!thread.ownerId || !thread.parent) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Thread Created" })
        .setFields([
            {
                name: "Owner",
                value: `${userMention(thread.ownerId)} (\`${thread.ownerId}\`)`,
            },
            {
                name: "Parent Channel",
                value: `${thread.parent} (\`#${thread.parent.name}\`)`,
            },
            {
                name: "Thread",
                value: `${thread} (\`#${thread.name}\`)`,
            }
        ])
        .setTimestamp();

    await log({
        event: LoggingEvent.ThreadCreate,
        message: { embeds: [embed] },
        channel: thread.parent,
        config
    });
}