import {
    AttachmentBuilder,
    GuildBasedChannel,
    GuildMember,
    GuildTextBasedChannel,
    Message,
    MessageCreateOptions,
    MessagePayload
} from "discord.js";

import { LoggingEvent, Scoping } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import Sentry from "@sentry/node";

/**
 * Logs an event to the appropriate logging channels
 *
 * @param data - The data to log
 */
export async function log(data: {
    event: LoggingEvent,
    config: GuildConfig,
    member: GuildMember | null,
    channel: GuildBasedChannel | null,
    message: string | MessagePayload | MessageCreateOptions
}): Promise<Message<true>[] | null> {
    const { event, config, channel, message, member } = data;

    try {
        const channels = await getLoggingChannels({ event, config, member, channel });

        // Send the content in parallel to all logging channels
        return Promise.all(channels.map(c => c.send(message)));
    } catch (error) {
        Sentry.captureException(error, {
            extra: {
                event,
                channel: channel?.id
            }
        });
    }

    return null;
}

/**
 * Fetches all in-scope logging channels for a given event
 *
 * @param data.event - The event to log
 * @param data.config - The guild's configuration
 * @param data.member - The member the event occurred to
 * @param data.channel - The channel the event occurred in
 */
async function getLoggingChannels(data: {
    event: LoggingEvent,
    config: GuildConfig,
    member: GuildMember | null,
    channel: GuildBasedChannel | null
}): Promise<GuildTextBasedChannel[]> {
    const { event, config, member, channel } = data;

    const inLoggingScope = (logScoping: Scoping): boolean => {
        if (!logScoping.include_roles.length && !logScoping.exclude_roles.length) {
            logScoping.include_roles = config.data.logging.default_scoping.include_roles;
            logScoping.exclude_roles = config.data.logging.default_scoping.exclude_roles;
        }

        // If there is no channel, the event is in scope
        if (!channel && member) {
            return config.roleInScope(member, logScoping);
        } else if (!channel) {
            return true;
        }

        // Resort to the default scoping if there is no override for the event
        if (!logScoping.include_channels.length && !logScoping.exclude_channels.length) {
            logScoping.include_channels = config.data.logging.default_scoping.include_channels;
            logScoping.exclude_channels = config.data.logging.default_scoping.exclude_channels;
        }

        // Check against event-specific scoping
        return config.inScope(channel, member, logScoping);
    };

    // Fetch all logging channels for this event that are in scope
    const loggingChannelPromises = config.data.logging.logs
        .filter(log => log.events.includes(event))
        .filter(log => inLoggingScope(log.scoping))
        .map(log => config.guild.channels.fetch(log.channel_id));

    const loggingChannels = await Promise.all(loggingChannelPromises);

    // Filter out any non-text-based channels
    return loggingChannels.filter((loggingChannel): loggingChannel is GuildTextBasedChannel => {
        return loggingChannel !== null
            && !loggingChannel.isDMBased()
            && loggingChannel.isTextBased();
    });
}

/**
 * Creates a text file from an array of message entries (for logging)
 *
 * @param entries - The message entries to log
 */
export function mapLogEntriesToFile(entries: string[]): AttachmentBuilder {
    const buffer = Buffer.from(entries.join("\n\n"), "utf-8");
    return new AttachmentBuilder(buffer, { name: "data.txt" });
}