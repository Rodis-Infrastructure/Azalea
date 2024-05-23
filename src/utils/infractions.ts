import { humanizeTimestamp, userMentionWithId } from "./index";
import { Infraction, Prisma } from "@prisma/client";
import { ColorResolvable, Colors, EmbedBuilder } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { client, prisma } from "./..";
import { log } from "./logging";
import { LoggingEvent } from "@managers/config/schema";
import { DEFAULT_INFRACTION_REASON } from "./constants";
import { TypedRegEx } from "typed-regex";
import { Result } from "./types";

import GuildConfig from "@managers/config/GuildConfig";
import Sentry from "@sentry/node";

/**
 * Handles the creation of a new infraction by:
 *
 * - Storing the infraction in the database.
 * - Logging the infraction in the appropriate channel.
 *
 * @param data - The infraction data to store in the database.
 * @param config - The guild configuration.
 * @returns The newly created infraction, or null if an error occurred.
 */
export async function handleInfractionCreate(data: Prisma.InfractionCreateInput, config: GuildConfig): Promise<Infraction | null> {
    let infraction: Infraction;

    // Attempt to store the infraction in the database.
    // If an error occurs, pass it to sentry and terminate the function.
    try {
        infraction = await prisma.infraction.create({ data });
    } catch (error) {
        Sentry.captureException(error, { extra: { data } });
        return null;
    }

    const embedColor = getActionColor(infraction.action);
    const embedTitle = parseInfractionType(infraction.action, infraction.flag);

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({ name: "Infraction Created" })
        .setTitle(embedTitle)
        .setFields([
            { name: "Executor", value: userMentionWithId(infraction.executor_id) },
            { name: "Target", value: userMentionWithId(infraction.target_id) },
            { name: "Reason", value: infraction.reason ?? DEFAULT_INFRACTION_REASON }
        ])
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    // Append the expiration date to the embed if it exists.
    if (infraction.expires_at) {
        // Since the infraction is new, we can assume that the expiration date is in the future.
        const msDuration = infraction.expires_at.getTime() - infraction.created_at.getTime();
        const humanizedDuration = humanizeTimestamp(msDuration);

        // Insert the duration field at the third position in the embed (after the target field)
        embed.spliceFields(2, 0, {
            name: "Duration",
            value: humanizedDuration
        });
    }

    // Log the infraction in the appropriate channel.
    log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });

    // Return the newly created infraction.
    return infraction;
}

export async function endActiveInfractions(guildId: Snowflake, targetId: Snowflake): Promise<void> {
    const now = new Date();

    await prisma.infraction.updateMany({
        where: {
            expires_at: { gt: now },
            guild_id: guildId,
            target_id: targetId
        },
        data: {
            expires_at: now,
            updated_at: now,
            updated_by: client.user.id
        }
    });
}

/**
 * Get the embed color for an infraction log based on its action
 *
 * @param action - The action associated with the infraction
 * @returns The hexadecimal embed color
 */
export function getActionColor(action: Action): ColorResolvable {
    switch (action) {
        case Action.Ban:
            return Colors.Blue;
        case Action.Unban:
            return Colors.Green;
        case Action.Kick:
            return Colors.Red;
        case Action.Mute:
            return Colors.Orange;
        case Action.Unmute:
            return Colors.Green;
        case Action.Warn:
            return Colors.Yellow;
        default:
            return Colors.NotQuiteBlack;
    }
}

/**
 * Get a parsed string representing the infraction type
 *
 * @param action - The action associated with the infraction
 * @param flag - The flag associated with the infraction
 * @returns A string combining the string representation of the action and flag
 */
export function parseInfractionType(action: Action, flag: Flag): string {
    return [Flag[flag], Action[action]]
        .filter(Boolean)
        .join(" ");
}

export async function validateInfractionReason(reason: string, config: GuildConfig): Promise<Result> {
    const { exclude_domains, message_links } = config.data.infraction_reasons;

    const domainRegex = TypedRegEx(`https?://(?<domain>${exclude_domains.domains.join("|")})`, "i");
    const domainMatch = domainRegex.captures(reason);

    if (exclude_domains.domains.length && domainMatch) {
        const parsedFailureMessage = exclude_domains.failure_message
            .replace("$DOMAIN", domainMatch.domain);

        return {
            success: false,
            message: parsedFailureMessage
        };
    }

    const channelIdRegex = TypedRegEx(`channels/${config.guild.id}/(?<channelId>\\d{17,19})`, "g");
    const channelIdMatches = channelIdRegex.captureAll(reason)
        .filter((match): match is { channelId: string } => Boolean(match))
        .map(({ channelId }) => channelId);

    const channels = await Promise.all(
        channelIdMatches.map(channelId => config.guild.channels.fetch(channelId).catch(() => null))
    );

    for (const channel of channels) {
        if (!channel) continue;

        const inScope = config.inScope(channel, message_links.scoping);

        if (!inScope) {
            const parsedFailureMessage = message_links.failure_message
                .replace("$CHANNEL_ID", channel.id)
                .replace("$CHANNEL_NAME", channel.name);

            return {
                success: false,
                message: parsedFailureMessage
            };
        }
    }

    return { success: true };
}

// The punishment associated with an infraction
export enum Action {
    Warn = 1,
    Unmute = 2,
    Mute = 3,
    Kick = 4,
    Unban = 5,
    Ban = 6,
}

// Mute duration in milliseconds
export enum MuteDuration {
    // 30 minutes
    Short = 1_800_000,
    // 1 hour
    Long = 3_600_000,
}

export enum Flag {
    // Infractions carried out using pre-set actions
    Quick = 1,
    // Infractions carried out by bots
    Automatic = 2,
    // Infractions carried out using discord's native tools
    Native = 3,
}