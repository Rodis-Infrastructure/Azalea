import { Colors, EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class ThreadCreateEventListener extends EventListener {
    constructor() {
        super(Events.ThreadCreate);
    }

    execute(thread: ThreadChannel): void {
        const config = ConfigManager.getGuildConfig(thread.guildId);
        if (!config) return;

        this.handleThreadCreateLog(thread, config);
    }

    handleThreadCreateLog(thread: ThreadChannel, config: GuildConfig): void {
        if (!thread.ownerId || !thread.parent) return;

        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Thread Created" })
            .setFields([
                {
                    name: "Owner",
                    value: userMentionWithId(thread.ownerId)
                },
                {
                    name: "Parent Channel",
                    value: channelMentionWithName(thread.parent)
                },
                {
                    name: "Thread",
                    value: channelMentionWithName(thread)
                }
            ])
            .setTimestamp();

        log({
            event: LoggingEvent.ThreadCreate,
            message: { embeds: [embed] },
            channel: thread.parent,
            config
        });
    }
}