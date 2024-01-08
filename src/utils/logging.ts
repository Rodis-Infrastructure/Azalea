import { EmbedBuilder, GuildMember, GuildTextBasedChannel } from "discord.js";
import { Config, LoggingEvent, Scoping } from "./config.ts";
import { Snowflake } from "discord-api-types/v10";

export async function log(
    event: LoggingEvent,
    config: Config,
    channel: GuildTextBasedChannel,
    member: GuildMember,
    embed: EmbedBuilder
): Promise<void> {
    const loggingChannels = await getLoggingChannels(event, config, channel, member);

    // Send the content in parallel to all logging channels
    await Promise.all(loggingChannels.map(loggingChannel => loggingChannel.send({ embeds: [embed] })));
}

async function getLoggingChannels(
    event: LoggingEvent,
    config: Config,
    channel: GuildTextBasedChannel,
    member: GuildMember
): Promise<GuildTextBasedChannel[]> {
    const loggingChannelPromises = config.logging.logs
        .filter(log => log.events.includes(event))
        .filter(log => {
            // Use default scoping unless an override is configured
            const scoping = log.scoping ?? config.logging.default_scoping;
            return inScope(scoping, channel, member);
        })
        .map(log => channel.guild.channels.fetch(log.channel_id).catch(() => null));

    const loggingChannels = await Promise.all(loggingChannelPromises);

    return loggingChannels.filter((loggingChannel): loggingChannel is GuildTextBasedChannel => {
        return loggingChannel !== null
            && !loggingChannel.isDMBased()
            && loggingChannel.isTextBased()
    });
}

function inScope(
    scoping: Scoping,
    channel: GuildTextBasedChannel,
    member: GuildMember
): boolean {
    const data: ChannelData = {
        categoryId: channel.parentId,
        channelId: channel.id,
        threadId: null
    };

    if (channel.isThread() && channel.parent) {
        data.channelId = channel.parent.id;
        data.threadId = channel.id;
        data.categoryId = channel.parent?.parentId;
    }


    return roleIsIncluded(scoping, member)
        && channelIsIncluded(scoping, data)
        && !channelIsExcluded(scoping, data);
}

function channelIsIncluded(scoping: Scoping, channelData: ChannelData): boolean {
    const { channelId, threadId, categoryId } = channelData;

    return (scoping.include_channels.length === 0 && scoping.exclude_channels.length === 0)
        || scoping.include_channels.includes(channelId)
        || (threadId !== null && scoping.include_channels.includes(threadId))
        || (categoryId !== null && scoping.include_channels.includes(categoryId));
}

function channelIsExcluded(scoping: Scoping, channelData: ChannelData): boolean {
    const { channelId, threadId, categoryId } = channelData;

    return scoping.exclude_channels.includes(channelId)
        || (threadId !== null && scoping.exclude_channels.includes(threadId))
        || (categoryId !== null && scoping.exclude_channels.includes(categoryId));
}

function roleIsIncluded(scoping: Scoping, member: GuildMember): boolean {
    return scoping.include_roles.length === 0
        || scoping.include_roles.some(roleId => member.roles.cache.has(roleId));
}

interface ChannelData {
    channelId: Snowflake;
    threadId: Snowflake | null;
    categoryId: Snowflake | null;
}