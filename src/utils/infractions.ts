import { humanizeTimestamp, userMentionWithId } from "./index";
import { Infraction, Prisma } from "@prisma/client";
import { Colors, EmbedBuilder } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { prisma } from "./..";
import { log } from "./logging";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
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

    const embedTitle = [infraction.flag, infraction.action]
        .filter(Boolean)
        .join(" ");

    const embed = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: "Infraction Created" })
        .setTitle(embedTitle)
        .setFields([
            { name: "Executor", value: userMentionWithId(infraction.executor_id) },
            { name: "Target", value: userMentionWithId(infraction.target_id) },
            { name: "Reason", value: infraction.reason }
        ])
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    // Append the expiration date to the embed if it exists.
    if (infraction.expires_at) {
        // Since the infraction is new, we can assume that the expiration date is in the future.
        const dateDiff = infraction.expires_at.getTime() - Date.now();
        const staticDuration = humanizeTimestamp(dateDiff);

        // Insert the duration field at the third position in the embed (after the target field)
        embed.spliceFields(2, 0, {
            name: "Duration",
            value: staticDuration
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

export async function handleInfractionArchive(data: {
    id: number,
    archived_by: Snowflake
}, config: GuildConfig): Promise<void> {
    const { id, archived_by } = data;

    let infraction: Infraction;

    try {
        infraction = await prisma.infraction.update({
            where: { id },
            data: {
                archived_at: new Date(),
                archived_by
            }
        });
    } catch (error) {
        Sentry.captureException(error, { extra: { data } });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Infraction Archived" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields({ name: "Archived By", value: userMentionWithId(archived_by) })
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });
}

export async function handleInfractionUnarchive(data: {
    id: number,
    unarchived_by: Snowflake
}, config: GuildConfig): Promise<void> {
    const { id, unarchived_by } = data;

    let infraction: Infraction;

    try {
        infraction = await prisma.infraction.update({
            where: { id },
            data: {
                archived_at: null,
                archived_by: null
            }
        });
    } catch (error) {
        Sentry.captureException(error, { extra: { data } });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Unarchived" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields({ name: "Unarchived By", value: userMentionWithId(unarchived_by) })
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });
}

export async function handleInfractionReasonChange(
    data: {
        id: number,
        reason: string,
        updated_by: Snowflake
    },
    config: GuildConfig
): Promise<void> {
    const { id, reason, updated_by } = data;

    let infraction: Infraction;

    try {
        infraction = await prisma.infraction.update({
            where: { id },
            data: {
                updated_at: new Date(),
                updated_by,
                reason
            }
        });
    } catch (error) {
        Sentry.captureException(error, { extra: { data } });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Reason Changed" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields([
            {
                name: "Updated By",
                value: userMentionWithId(updated_by)
            },
            {
                name: "New Reason",
                value: reason
            }
        ])
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });
}

export async function handleInfractionExpirationChange(
    data: {
        id: number,
        expires_at: Date,
        updated_by: Snowflake
    },
    config: GuildConfig,
    logChange = true
): Promise<void> {
    const { id, expires_at, updated_by } = data;

    let infraction: Infraction;

    try {
        infraction = await prisma.infraction.update({
            where: { id },
            data: {
                updated_at: new Date(),
                updated_by,
                expires_at
            }
        });
    } catch (error) {
        Sentry.captureException(error, { extra: { data } });
        return;
    }

    if (!logChange) return;

    const dateDiff = expires_at.getTime() - Date.now();
    const staticDuration = humanizeTimestamp(dateDiff);

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Expiration Changed" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields([
            {
                name: "Updated By",
                value: userMentionWithId(updated_by)
            },
            {
                name: "New Duration",
                value: staticDuration
            }
        ])
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });
}