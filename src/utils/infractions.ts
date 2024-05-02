import { humanizeTimestamp, userMentionWithId } from "./index";
import { Infraction, Prisma } from "@prisma/client";
import { ColorResolvable, Colors, EmbedBuilder } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { prisma } from "./..";
import { log } from "./logging";
import { LoggingEvent } from "@managers/config/schema";
import { DEFAULT_INFRACTION_REASON } from "./constants";

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

/**
 * Handles the expiration date change of an infraction by:
 *
 * - Updating the expiration date in the database.
 * - Logging the change in the appropriate channel.
 *
 * @param data
 * @param data.id - ID of the infraction to modify (latest mute by default)
 * @param data.expires_at - New expiration date of the infraction ({@link Date.now} by default)
 * @param data.updated_by - ID of the user responsible for changing the duration
 * @param data.target_id - ID of the user the infraction is applied to (specify if no ID is passed)
 * @param config - The guild configuration
 * @param logChange - Whether to log the change in the appropriate channel
 */
export async function handleInfractionExpirationChange(
    data: InfractionExpirationChangeData,
    config: GuildConfig,
    logChange = true
): Promise<void> {
    const { expires_at, updated_by, target_id } = data;
    let { id } = data;

    let infraction: Infraction;

    try {
        // Use the most recent mute's ID if no ID is provided
        if (!id) {
            const recentMuteInfraction = await prisma.infraction.findFirst({
                where: {
                    action: Action.Mute,
                    expires_at: { gt: new Date() },
                    guild_id: config.guild.id,
                    target_id
                },
                select: {
                    id: true
                }
            });

            if (!recentMuteInfraction) return;
            id = recentMuteInfraction.id;
        }

        infraction = await prisma.infraction.update({
            where: { id },
            data: {
                updated_at: new Date(),
                expires_at: expires_at ?? new Date(),
                updated_by
            }
        });
    } catch (error) {
        Sentry.captureException(error, { extra: { data } });
        return;
    }

    if (!logChange) return;

    const msExpiresAt = expires_at?.getTime() ?? Date.now();
    const msDuration = msExpiresAt - infraction.created_at.getTime();
    const humanizedDuration = humanizeTimestamp(msDuration);

    const embedTitle = parseInfractionType(infraction.action, infraction.flag);
    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Expiration Changed" })
        .setTitle(embedTitle)
        .setFields([
            {
                name: "Updated By",
                value: userMentionWithId(updated_by)
            },
            {
                name: "New Duration",
                value: humanizedDuration
            }
        ])
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.InfractionUpdate,
        message: { embeds: [embed] },
        channel: null,
        config
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
        case Action.Note:
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

type InfractionExpirationChangeData = {
    id: number,
    updated_by: Snowflake,
    expires_at?: Date,
    target_id?: never
} | {
    target_id: Snowflake,
    updated_by: Snowflake,
    expires_at?: Date,
    id?: never
};

// The punishment associated with an infraction
export enum Action {
    Note = 1,
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
}