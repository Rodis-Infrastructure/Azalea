import {
    AttachmentBuilder,
    GuildBasedChannel,
    GuildTextBasedChannel,
    MessageCreateOptions,
    MessagePayload
} from "discord.js";

import { ChannelScoping, GuildConfig, LoggingEvent } from "./config.ts";
import { Snowflake } from "discord-api-types/v10";

export async function log(data: {
    event: LoggingEvent,
    config: GuildConfig,
    channel: GuildBasedChannel | null,
    message: string | MessagePayload | MessageCreateOptions
}): Promise<void> {
    const { event, config, channel, message } = data;
    const loggingChannels = await getLoggingChannels(event, config, channel);

    // Send the content in parallel to all logging channels
    await Promise.all(loggingChannels.map(loggingChannel => loggingChannel.send(message)));
}

async function getLoggingChannels(
    event: LoggingEvent,
    config: GuildConfig,
    channel: GuildBasedChannel | null
): Promise<GuildTextBasedChannel[]> {
    const loggingChannelPromises = config.logging.logs
        .filter(log => log.events.includes(event))
        .filter(log => !channel || inScope(log.scoping, channel))
        .map(log => config.guild.channels.fetch(log.channel_id).catch(() => null));

    const loggingChannels = await Promise.all(loggingChannelPromises);

    return loggingChannels.filter((loggingChannel): loggingChannel is GuildTextBasedChannel => {
        return loggingChannel !== null
            && !loggingChannel.isDMBased()
            && loggingChannel.isTextBased();
    });
}

function inScope(scoping: ChannelScoping, channel: GuildBasedChannel): boolean {
    const data: ChannelData = {
        categoryId: channel.parentId,
        channelId: channel.id,
        threadId: null
    };

    if (channel.isThread() && channel.parent) {
        data.channelId = channel.parent.id;
        data.threadId = channel.id;
        data.categoryId = channel.parent.parentId;
    }

    return channelIsIncluded(scoping, data) && !channelIsExcluded(scoping, data);
}

function channelIsIncluded(scoping: ChannelScoping, channelData: ChannelData): boolean {
    const { channelId, threadId, categoryId } = channelData;

    return (scoping.include_channels.length === 0 && scoping.exclude_channels.length === 0)
        || scoping.include_channels.includes(channelId)
        || (threadId !== null && scoping.include_channels.includes(threadId))
        || (categoryId !== null && scoping.include_channels.includes(categoryId));
}

function channelIsExcluded(scoping: ChannelScoping, channelData: ChannelData): boolean {
    const { channelId, threadId, categoryId } = channelData;

    return scoping.exclude_channels.includes(channelId)
        || (threadId !== null && scoping.exclude_channels.includes(threadId))
        || (categoryId !== null && scoping.exclude_channels.includes(categoryId));
}

export function mapLogEntriesToFile(entries: string[]): AttachmentBuilder {
    const buffer = Buffer.from(entries.join("\n\n"), "utf-8");
    return new AttachmentBuilder(buffer, { name: "data.txt" });
}

export interface ChannelData {
    channelId: Snowflake;
    threadId: Snowflake | null;
    categoryId: Snowflake | null;
}