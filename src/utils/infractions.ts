import { msToString, userMentionWithId } from "./index.ts";
import { EMPTY_INFRACTION_REASON } from "./constants.ts";
import { GuildConfig, LoggingEvent } from "./config.ts";
import { Colors, EmbedBuilder } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { Infraction } from "@prisma/client";
import { prisma } from "../index.ts";
import { log } from "./logging.ts";

export async function handleInfractionCreate(
    data: Omit<Infraction, "updated_by" | "updated_at" | "archived_by" | "archived_at" | "id" | "created_at">,
    config: GuildConfig
): Promise<Infraction> {
    const infraction = await prisma.infraction.create({ data });
    const title = [infraction.flag, infraction.action]
        .filter(Boolean)
        .join(" ");

    const embed = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: "Infraction Created" })
        .setTitle(title)
        .setFields([
            {
                name: "Executor",
                value: userMentionWithId(infraction.executor_id)
            },
            {
                name: "Target",
                value: userMentionWithId(infraction.target_id)
            },
            {
                name: "Reason",
                value: infraction.reason ?? EMPTY_INFRACTION_REASON
            }
        ])
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    // Since the infraction is new, we can assume that the expiration date is in the future.
    if (infraction.expires_at) {
        const dateDiff = infraction.expires_at.getTime() - Date.now();
        const staticDuration = msToString(dateDiff);

        embed.spliceFields(2, 0, {
            name: "Duration",
            value: staticDuration
        });
    }

    await log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });

    return infraction;
}

export async function handleInfractionArchive(id: number, archivedBy: Snowflake, config: GuildConfig): Promise<void> {
    const infraction = await prisma.infraction.update({
        where: { id },
        data: {
            archived_at: new Date(),
            archived_by: archivedBy
        }
    });

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Infraction Archived" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields({ name: "Archived By", value: userMentionWithId(archivedBy) })
        .setFooter({ text: `#${infraction.id}` })
        .setTimestamp();

    await log({
        event: LoggingEvent.InfractionCreate,
        message: { embeds: [embed] },
        channel: null,
        config
    });
}

export async function handleInfractionUnarchive(id: number, unarchivedBy: Snowflake, config: GuildConfig): Promise<void> {
    const infraction = await prisma.infraction.update({
        where: { id },
        data: {
            archived_at: null,
            archived_by: null
        }
    });

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Unarchived" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields({ name: "Unarchived By", value: userMentionWithId(unarchivedBy) })
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
    id: number,
    newReason: string,
    updatedBy: Snowflake,
    config: GuildConfig
): Promise<void> {
    const infraction = await prisma.infraction.update({
        where: { id },
        data: {
            updated_at: new Date(),
            updated_by: updatedBy,
            reason: newReason
        }
    });

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Reason Changed" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields([
            {
                name: "Updated By",
                value: userMentionWithId(updatedBy)
            },
            {
                name: "New Reason",
                value: newReason
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
    id: number,
    newExpirationDate: Date,
    updatedBy: Snowflake,
    config: GuildConfig
): Promise<void> {
    const infraction = await prisma.infraction.update({
        where: { id },
        data: {
            updated_at: new Date(),
            updated_by: updatedBy,
            expires_at: newExpirationDate
        }
    });

    const dateDiff = newExpirationDate.getTime() - Date.now();
    const staticDuration = msToString(dateDiff);

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Infraction Expiration Changed" })
        .setTitle(`${infraction.flag} ${infraction.action}`)
        .setFields([
            {
                name: "Updated By",
                value: userMentionWithId(updatedBy)
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