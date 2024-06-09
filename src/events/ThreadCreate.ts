import { Colors, EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class ThreadCreate extends EventListener {
    constructor() {
        super(Events.ThreadCreate);
    }

    execute(thread: ThreadChannel): void {
        const config = ConfigManager.getGuildConfig(thread.guildId);
        if (!config) return;

        ThreadCreate._log(thread, config);
    }

    private static async _log(thread: ThreadChannel, config: GuildConfig): Promise<void> {
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

        const owner = await thread.fetchOwner();

        log({
            event: LoggingEvent.ThreadCreate,
            message: { embeds: [embed] },
            channel: thread.parent,
            member: owner?.guildMember ?? null,
            config
        });
    }
}