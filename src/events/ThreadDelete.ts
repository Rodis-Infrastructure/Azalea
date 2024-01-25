import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { Colors, EmbedBuilder, Events, ThreadChannel } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "../utils";
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
                value: userMentionWithId(thread.ownerId)
            },
            {
                name: "Parent Channel",
                value: channelMentionWithName(thread.parent)
            },
            {
                name: "Thread",
                // No need to mention the channel since it's already deleted
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