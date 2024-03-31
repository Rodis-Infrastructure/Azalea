import { channelMentionWithName, getObjectDiff, userMentionWithId } from "@/utils";
import { EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { log } from "@utils/logging";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class ThreadUpdateEventListener extends EventListener {
    constructor() {
        super(Events.ThreadUpdate);
    }

    execute(oldThread: ThreadChannel, newThread: ThreadChannel): void {
        const config = ConfigManager.getGuildConfig(newThread.guildId);
        if (!config) return;

        this.handleThreadUpdateLog(oldThread, newThread, config);
    }

    handleThreadUpdateLog(oldThread: ThreadChannel, newThread: ThreadChannel, config: GuildConfig): void {
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
                    value: userMentionWithId(newThread.ownerId)
                },
                {
                    name: "Parent Channel",
                    value: channelMentionWithName(newThread.parent)
                },
                {
                    name: "Thread",
                    value: channelMentionWithName(newThread)
                },
                {
                    name: "Changes",
                    value: changes.join("\n")
                }
            ])
            .setTimestamp();

        log({
            event: LoggingEvent.ThreadUpdate,
            message: { embeds: [embed] },
            channel: newThread.parent,
            config
        });
    }
}