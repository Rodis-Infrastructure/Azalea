import { Colors, EmbedBuilder, Events, ThreadChannel, userMention } from "discord.js";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class ThreadDeleteEventListener extends EventListener {
    constructor() {
        super(Events.ThreadDelete);
    }

    async execute(thread: ThreadChannel): Promise<void> {
        const config = ConfigManager.getGuildConfig(thread.guildId);
        if (!config) return;

        await handleThreadDeleteLog(thread, config);
    }
}

async function handleThreadDeleteLog(thread: ThreadChannel, config: GuildConfig): Promise<void> {
    if (!thread.ownerId || !thread.parent) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Thread Deleted" })
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
                value: `\`#${thread.name}\``,
            }
        ])
        .setFooter({ text: `ID: ${thread.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.ThreadDelete,
        message: { embeds: [embed] },
        channel: thread.parent,
        config
    });
}