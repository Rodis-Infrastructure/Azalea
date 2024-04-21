import { channelMentionWithName, getObjectDiff, userMentionWithId } from "@/utils";
import { Colors, EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class ThreadUpdate extends EventListener {
    constructor() {
        super(Events.ThreadUpdate);
    }

    execute(oldThread: ThreadChannel, newThread: ThreadChannel): void {
        const config = ConfigManager.getGuildConfig(newThread.guildId);
        if (!config) return;

        ThreadUpdate._log(oldThread, newThread, config);
    }

    private static _log(oldThread: ThreadChannel, newThread: ThreadChannel, config: GuildConfig): void {
        if (!newThread.ownerId || !newThread.parent) return;

        const difference = getObjectDiff(oldThread, newThread);
        const changes: string[] = [];

        for (const [prop, diff] of Object.entries(difference)) {
            changes.push(`> ${prop}\n> \`${diff.old}\` → \`${diff.new}\`\n`);
        }

        if (!changes.length) return;

        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
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