import {
    AuditLogEvent,
    Colors,
    EmbedBuilder,
    escapeInlineCode,
    Events,
    Guild,
    GuildAuditLogsEntry,
    GuildMember,
    inlineCode,
    Snowflake,
    time,
    TimestampStyles,
    User
} from "discord.js";

import { Action, Flag, handleInfractionCreate } from "@utils/infractions";
import { DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { client, prisma } from "./..";
import { MessageReportStatus, UserReportStatus } from "@utils/reports";
import { pluralize } from "@/utils";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
import Sentry from "@sentry/node";
import GuildConfig from "@managers/config/GuildConfig";
import Logger from "@utils/logger";

export default class GuildAuditLogEntryCreate extends EventListener {
    constructor() {
        super(Events.GuildAuditLogEntryCreate);
    }

    async execute(auditLog: GuildAuditLogsEntry, guild: Guild): Promise<void> {
        const { target, reason, changes, executorId } = auditLog;
        const config = ConfigManager.getGuildConfig(guild.id);

        if (!config || !executorId || executorId === client.user.id) return;
        if (!(target instanceof User) && !(target instanceof GuildMember)) return;

        const executor = await client.users.fetch(executorId).catch(() => null);
        if (!executor) return;

        const parsedReason = reason ?? DEFAULT_INFRACTION_REASON;
        const formattedReason = `(${inlineCode(escapeInlineCode(parsedReason))})`;

        let notification = `${target} has been $ACTION by ${executor} ${formattedReason}`;
        let action: Action | undefined;

        const setAction = (actionType: Action, str: string): void => {
            notification = notification.replace("$ACTION", str);
            action = actionType;
        };

        const flag = executor.bot
            ? Flag.Automatic
            : Flag.Native;

        switch (auditLog.action) {
            case AuditLogEvent.MemberKick:
                setAction(Action.Kick, "kicked");
                break;

            case AuditLogEvent.MemberBanAdd:
                action = Action.Ban;
                setAction(Action.Ban, "banned");

                try {
                    await clearMessageReports(target.id, config);
                    await clearUserReports(target.id, config);
                } catch (err) {
                    Sentry.captureException(err);
                }

                break;

            case AuditLogEvent.MemberBanRemove:
                setAction(Action.Unban, "unbanned");
                break;

            case AuditLogEvent.MemberUpdate: {
                const muteDurationDiff = changes.find(change => change.key === "communication_disabled_until");

                if (muteDurationDiff) {
                    // User has been muted
                    if (muteDurationDiff.new) {
                        const msDuration = Date.parse(muteDurationDiff.new as string);
                        const expiresAt = Math.floor(msDuration / 1000);

                        setAction(Action.Mute, `muted until ${time(expiresAt, TimestampStyles.LongDateTime)}`);

                        try {
                            await handleInfractionCreate({
                                guild_id: guild.id,
                                action: Action.Mute,
                                executor_id: executor.id,
                                target_id: target.id,
                                reason: parsedReason,
                                flag: flag,
                                expires_at: new Date(msDuration)
                            }, config);

                            config.sendNotification(notification, false);
                            return;
                        } catch (error) {
                            Sentry.captureException(error);
                        }
                    }

                    // User has been unmuted
                    if (!muteDurationDiff.new) {
                        setAction(Action.Unmute, "unmuted");
                    }
                }

                break;
            }
        }

        if (!action) return;

        await handleInfractionCreate({
            guild_id: guild.id,
            action,
            executor_id: executor.id,
            target_id: target.id,
            reason: parsedReason,
            flag
        }, config);

        config.sendNotification(notification, false);
    }
}

async function clearMessageReports(userId: Snowflake, config: GuildConfig): Promise<void> {
    const messageReportChannelId = config.data.message_reports?.report_channel;
    const messageReportChannel = messageReportChannelId && await config.guild.channels
        .fetch(messageReportChannelId)
        .catch(() => null);

    if (!messageReportChannel || !messageReportChannel.isTextBased()) {
        return;
    }

    const [messageReports] = await prisma.$transaction([
        prisma.messageReport.findMany({
            select: { id: true },
            where: {
                status: MessageReportStatus.Unresolved,
                message_deleted: true,
                author_id: userId
            }
        }),
        prisma.messageReport.updateMany({
            data: { status: MessageReportStatus.Resolved },
            where: {
                status: MessageReportStatus.Unresolved,
                message_deleted: true,
                author_id: userId
            }
        })
    ]);

    const messageReportsIds = messageReports.map(report => report.id);
    const clearedMessageReports = await messageReportChannel.bulkDelete(messageReportsIds);

    for (const messageReport of clearedMessageReports.values()) {
        const embed = new EmbedBuilder(messageReport!.embeds[0].toJSON())
            .setColor(Colors.Green)
            .setTitle("Message Report Resolved");

        log({
            event: LoggingEvent.MessageReportResolve,
            message: {
                content: "Resolved automatically due to ban.",
                embeds: [embed]
            },
            channel: null,
            config
        });
    }

    Logger.info(`Cleared ${clearedMessageReports.size} message ${pluralize(clearedMessageReports.size, "report")} against ${userId}`);
}

async function clearUserReports(userId: Snowflake, config: GuildConfig): Promise<void> {
    const userReportChannelId = config.data.user_reports?.report_channel;
    const userReportChannel = userReportChannelId && await config.guild.channels
        .fetch(userReportChannelId)
        .catch(() => null);

    if (!userReportChannel || !userReportChannel.isTextBased()) {
        return;
    }

    const [userReports] = await prisma.$transaction([
        prisma.userReport.findMany({
            select: { id: true },
            where: {
                status: UserReportStatus.Unresolved,
                target_id: userId
            }
        }),
        prisma.userReport.updateMany({
            data: { status: UserReportStatus.Resolved },
            where: {
                status: UserReportStatus.Unresolved,
                target_id: userId
            }
        })
    ]);

    const userReportsIds = userReports.map(report => report.id);
    const clearedUserReports = await userReportChannel.bulkDelete(userReportsIds);

    for (const userReport of clearedUserReports.values()) {
        const embed = new EmbedBuilder(userReport!.embeds[0].toJSON())
            .setColor(Colors.Green)
            .setTitle("User Report Resolved");

        log({
            event: LoggingEvent.UserReportResolve,
            message: {
                content: "Resolved automatically due to ban.",
                embeds: [embed]
            },
            channel: null,
            config
        });
    }

    Logger.info(`Cleared ${clearedUserReports.size} user ${pluralize(clearedUserReports.size, "report")} against ${userId}`);
}