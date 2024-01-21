import { EmbedBuilder, Events, ThreadChannel, userMention } from "discord.js";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";
import { getObjectDiff } from "../utils";

import EventListener from "../handlers/events/EventListener.ts";

export default class ThreadUpdateEventListener extends EventListener {
    constructor() {
        super(Events.ThreadUpdate);
    }

    async execute(oldThread: ThreadChannel, newThread: ThreadChannel): Promise<void> {
        const config = ConfigManager.getGuildConfig(newThread.guildId);
        if (!config) return;

        await handleThreadUpdateLog(oldThread, newThread, config);
    }
}

async function handleThreadUpdateLog(oldThread: ThreadChannel, newThread: ThreadChannel, config: GuildConfig): Promise<void> {
    if (!newThread.ownerId || !newThread.parent) return;

    const difference = getObjectDiff(oldThread, newThread);
    const changes: string[] = [];

    for (const [prop, diff] of Object.entries(difference)) {
        changes.push(`> ${prop}\n> \`${diff.old}\` → \`${diff.new}\`\n`);
    }

    if (!changes.length) return;

    const embed = new EmbedBuilder()
        .setColor(0x9C84EF) // Light purple
        .setAuthor({ name: "Thread Updated" })
        .setFields([
            {
                name: "Owner",
                value: `${userMention(newThread.ownerId)} (\`${newThread.ownerId}\`)`,
            },
            {
                name: "Parent Channel",
                value: `${newThread.parent} (\`#${newThread.parent.name}\`)`,
            },
            {
                name: "Thread",
                value: `${newThread} (\`#${newThread.name}\`)`,
            },
            {
                name: "Changes",
                value: changes.join("\n")
            }
        ])
        .setTimestamp();

    await log({
        event: LoggingEvent.ThreadUpdate,
        message: { embeds: [embed] },
        channel: newThread.parent,
        config
    });
}