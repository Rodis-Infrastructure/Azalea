import { Colors, EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class ThreadDelete extends EventListener {
    constructor() {
        super(Events.ThreadDelete);
    }

    execute(thread: ThreadChannel): void {
        const config = ConfigManager.getGuildConfig(thread.guildId);
        if (!config) return;

        ThreadDelete._log(thread, config);
    }

    private static async _log(thread: ThreadChannel, config: GuildConfig): Promise<void> {
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
            .setFooter({ text: `Thread ID: ${thread.id}` })
            .setTimestamp();

        const owner = await thread.fetchOwner();

        log({
            event: LoggingEvent.ThreadDelete,
            message: { embeds: [embed] },
            channel: thread.parent,
            member: owner?.guildMember ?? null,
            config
        });
    }
}