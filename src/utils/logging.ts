import {
    AttachmentBuilder,
    GuildBasedChannel,
    GuildTextBasedChannel,
    Message,
    MessageCreateOptions,
    MessagePayload
} from "discord.js";

import { GuildConfig, inScope, LoggingEvent } from "./config.ts";

import Sentry from "@sentry/node";

// @returns The messages sent
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

async function getLoggingChannels(
    event: LoggingEvent,
    config: GuildConfig,
    channel: GuildBasedChannel | null
): Promise<GuildTextBasedChannel[]> {
    const loggingChannelPromises = config.logging.logs
        .filter(log => log.events.includes(event))
        .filter(log => !channel || inScope(log.scoping, channel))
        .map(log => config.guild.channels.fetch(log.channel_id));

    const loggingChannels = await Promise.all(loggingChannelPromises);

    return loggingChannels.filter((loggingChannel): loggingChannel is GuildTextBasedChannel => {
        return loggingChannel !== null
            && !loggingChannel.isDMBased()
            && loggingChannel.isTextBased();
    });
}

export function mapLogEntriesToFile(entries: string[]): AttachmentBuilder {
    const buffer = Buffer.from(entries.join("\n\n"), "utf-8");
    return new AttachmentBuilder(buffer, { name: "data.txt" });
}