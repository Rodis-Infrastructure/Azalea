import {
    AttachmentBuilder,
    GuildBasedChannel,
    GuildTextBasedChannel,
    Message,
    MessageCreateOptions,
    MessagePayload
} from "discord.js";

import { LoggingEvent, ChannelScoping } from "@managers/config/schema";

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
    channel: GuildBasedChannel | null,
    message: string | MessagePayload | MessageCreateOptions
}): Promise<Message<true>[] | null> {
    const { event, config, channel, message } = data;

    try {
        const channels = await getLoggingChannels(event, config, channel);

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
 * @param event - The event to log
 * @param config - The guild's configuration
 * @param channel - The channel the event occurred in
 */
async function getLoggingChannels(
    event: LoggingEvent,
    config: GuildConfig,
    channel: GuildBasedChannel | null
): Promise<GuildTextBasedChannel[]> {
    const inLoggingScope = (logScoping: ChannelScoping): boolean => {
        // If there is no channel, the event is in scope
        if (!channel) return true;

        // Resort to the default scoping if there is no override for the event
        if (!logScoping.include_channels.length && !logScoping.exclude_channels.length) {
            return config.inScope(channel, config.data.logging.default_scoping);
        }

        // Check against event-specific scoping
        return config.inScope(channel, logScoping);
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