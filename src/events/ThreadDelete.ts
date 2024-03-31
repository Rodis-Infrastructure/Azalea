import { Colors, EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class ThreadDeleteEventListener extends EventListener {
    constructor() {
        super(Events.ThreadDelete);
    }

    execute(thread: ThreadChannel): void {
        const config = ConfigManager.getGuildConfig(thread.guildId);
        if (!config) return;

        this.handleThreadDeleteLog(thread, config);
    }

    handleThreadDeleteLog(thread: ThreadChannel, config: GuildConfig): void {
        if (!thread.ownerId || !thread.parent) return;

        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Thread Deleted" })
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
                    // No need to mention the channel since it's already deleted
                    value: `\`#${thread.name}\``
                }
            ])
            .setFooter({ text: `ID: ${thread.id}` })
            .setTimestamp();

        log({
            event: LoggingEvent.ThreadDelete,
            message: { embeds: [embed] },
            channel: thread.parent,
            config
        });
    }
}