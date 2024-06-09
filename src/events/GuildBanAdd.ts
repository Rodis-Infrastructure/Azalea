import { Colors, EmbedBuilder, Events, GuildBan, Snowflake } from "discord.js";
import { MessageReportStatus, UserReportStatus } from "@utils/reports";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";
import { pluralize } from "@/utils";
import { InfractionManager } from "@utils/infractions";
import { prisma } from "./..";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
import GuildConfig from "@managers/config/GuildConfig";
import Logger from "@utils/logger";
import Sentry from "@sentry/node";

export default class GuildBanAdd extends EventListener {
    constructor() {
        super(Events.GuildBanAdd);
    }

    async execute(ban: GuildBan): Promise<void> {
        const config = ConfigManager.getGuildConfig(ban.guild.id);
        if (!config) return;

        try {
            await Promise.all([
                InfractionManager.endActiveMutes(ban.guild.id, ban.user.id),
                GuildBanAdd._clearMessageReports(ban.user.id, config),
                GuildBanAdd._clearUserReports(ban.user.id, config)
            ]);
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            Logger.error(`Failed to perform cleanup operations for @${ban.user.username} (${ban.user.id}) | ${sentryId}`);
        }
    }

    private static async _clearMessageReports(userId: Snowflake, config: GuildConfig): Promise<void> {
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

        if (!messageReports.length) return;

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
                member: null,
                config
            });
        }

        Logger.info(`Cleared ${clearedMessageReports.size} message ${pluralize(clearedMessageReports.size, "report")} against ${userId}`);
    }

    private static async _clearUserReports(userId: Snowflake, config: GuildConfig): Promise<void> {
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

        if (!userReports.length) return;

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
                member: null,
                config
            });
        }

        Logger.info(`Cleared ${clearedUserReports.size} user ${pluralize(clearedUserReports.size, "report")} against ${userId}`);
    }
}