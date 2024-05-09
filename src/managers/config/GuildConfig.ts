import { Snowflake } from "discord-api-types/v10";
import { Colors, EmbedBuilder, Guild, GuildBasedChannel, GuildMember, messageLink, roleMention } from "discord.js";
import { ChannelScoping, Permission, RawGuildConfig, rawGuildConfigSchema } from "./schema";
import { client, prisma } from "@/index";
import { MessageReportStatus, UserReportStatus } from "@utils/reports";
import { fromZodError } from "zod-validation-error";
import { InteractionReplyData } from "@utils/types";
import { pluralize, startCronJob } from "@/utils";

import Logger from "@utils/logger";

export default class GuildConfig {
    private constructor(public readonly data: RawGuildConfig, public readonly guild: Guild) {
    }

    /**
     * Ensure the values passed to the configuration are appropriate
     *
     * @param guildId - ID of the guild associated with the config
     * @param data - The raw config data
     * @returns Parsed instance of the guild's configuration
     */
    static async from(guildId: Snowflake, data: unknown): Promise<GuildConfig | null> {
        const guild = await client.guilds
            .fetch(guildId)
            .catch(() => null);

        if (!guild) {
            Logger.warn(`GUILD_CONFIG: ${guildId} | Failed to fetch guild`);
            return null;
        }

        const config = GuildConfig.parse(guildId, data);
        return new GuildConfig(config, guild);
    }

    /**
     * Set default values and validate the guild configuration
     *
     * @param guildId - ID of the guild associated with the config
     * @param data - The guild configuration data
     * @returns The guild configuration with default values set
     * @private
     */
    static parse(guildId: Snowflake, data: unknown): RawGuildConfig {
        const parseResult = rawGuildConfigSchema.safeParse(data);

        if (!parseResult.success) {
            const validationError = fromZodError(parseResult.error);
            Logger.error(`GUILD_CONFIG: ${guildId} | ${validationError.toString()}`);
            process.exit(1);
        }

        return parseResult.data;
    }

    // Start the cron job for each scheduled message
    async startScheduledMessageCronJobs(): Promise<void> {
        // Start the cron job for each scheduled message
        for (const scheduledMessage of this.data.scheduled_messages) {
            const channel = await this.guild.channels
                .fetch(scheduledMessage.channel_id)
                .catch(() => null);

            const stringifiedData = JSON.stringify(scheduledMessage);

            if (!channel) {
                Logger.error(`Failed to mount scheduled message, unknown channel.\ndata: ${stringifiedData}`);
                continue;
            }

            if (!channel.isTextBased()) {
                Logger.error(`Failed to mount scheduled message, channel is not text-based.\ndata: ${stringifiedData}`);
                continue;
            }

            // Start the cron job for the scheduled message
            startCronJob("SCHEDULED_MESSAGE", scheduledMessage.cron, () => {
                Logger.info(`Sending message: ${stringifiedData}`);
                channel.send(scheduledMessage.content);
            });
        }
    }

    getQuickResponse(value: string): InteractionReplyData {
        return this.data.quick_responses.find(response => response.value === value)?.response ?? null;
    }

    async startRequestReviewReminderCronJobs(): Promise<void> {
        for (const request of this.data.moderation_requests) {
            const alertConfig = request.alert;
            if (!alertConfig) return;

            const channel = await this.guild.channels
                .fetch(alertConfig.channel_id)
                .catch(() => null);

            const stringifiedData = JSON.stringify(request);

            if (!channel) {
                Logger.error(`Failed to mount moderation request alert, unknown channel: ${stringifiedData}`);
                continue;
            }

            if (!channel.isTextBased()) {
                Logger.error(`Failed to mount moderation request alert, channel is not text-based: ${stringifiedData}`);
                continue;
            }

            const getAlertEmbed = (unresolvedRequestCount: number, oldestRequestUrl: string): EmbedBuilder => new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle("Request Review Reminder")
                .setDescription(`There are currently \`${unresolvedRequestCount}\` unresolved ${request.type} requests starting from ${oldestRequestUrl}`)
                .setFooter({ text: `This message appears when there are ${alertConfig.count_threshold}+ unresolved ${request.type} requests` });

            const mentionedRoles = alertConfig.mentioned_roles
                .map(roleMention)
                .join(" ") || "";

            const monitorSlug = `${request.type.toUpperCase()}_REQUEST_REVIEW_REMINDER`;

            // Start the cron job for the alert
            startCronJob(monitorSlug, alertConfig.cron, async () => {
                const unresolvedRequests = await prisma.moderationRequest.findMany({
                    where: {
                        status: MessageReportStatus.Unresolved,
                        guild_id: this.guild.id
                    },
                    orderBy: {
                        created_at: "asc"
                    }
                });

                Logger.info(`Count: ${unresolvedRequests.length}`);
                Logger.info(`Threshold: ${alertConfig.count_threshold}`);

                if (unresolvedRequests.length < alertConfig.count_threshold) {
                    Logger.info("Count is below the threshold, no actions need to be taken");
                    return;
                }

                Logger.info("Count exceeds the threshold, sending reminder");

                const [oldestRequest] = unresolvedRequests;
                const oldestRequestUrl = messageLink(request.channel_id, oldestRequest.id, this.guild.id);
                const embeds = [];

                if (alertConfig.embed) {
                    embeds.push(getAlertEmbed(unresolvedRequests.length, oldestRequestUrl));
                }

                // Send the alert to the channel
                channel.send({
                    content: `${mentionedRoles} Pending ${request.type} requests`,
                    embeds
                });
            });
        }
    }

    async startMessageReportReviewReminderCronJob(): Promise<void> {
        const alertConfig = this.data.message_reports?.alert;
        if (!alertConfig) return;

        const channel = await this.guild.channels
            .fetch(alertConfig.channel_id)
            .catch(() => null);

        const stringifiedData = JSON.stringify(alertConfig);

        if (!channel) {
            Logger.error(`Failed to mount message report review reminders, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!channel.isTextBased()) {
            Logger.error(`Failed to mount message report review reminders, channel is not text-based: ${stringifiedData}`);
            return;
        }

        const getAlertEmbed = (unresolvedReportCount: number): EmbedBuilder => new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle("Message Report Review Reminder")
            .setDescription(`There are currently \`${unresolvedReportCount}\` unresolved message reports`)
            .setFooter({ text: `This message appears when there are ${alertConfig.count_threshold}+ unresolved message reports` });

        const mentionedRoles = alertConfig.mentioned_roles
            .map(roleMention)
            .join(" ") || "";

        // Start the cron job for the alert
        startCronJob("MESSAGE_REPORT_REVIEW_REMINDER", alertConfig.cron, async () => {
            const unresolvedReportCount = await prisma.messageReport.count({
                where: {
                    status: MessageReportStatus.Unresolved
                }
            });

            Logger.info(`Count: ${unresolvedReportCount}`);
            Logger.info(`Threshold: ${alertConfig.count_threshold}`);

            if (unresolvedReportCount < alertConfig.count_threshold) {
                Logger.info("Count is below the threshold, no actions need to be taken");
                return;
            }

            Logger.info("Count exceeds the threshold, sending reminder");
            const embeds = [];

            if (alertConfig.embed) {
                embeds.push(getAlertEmbed(unresolvedReportCount));
            }

            // Send the alert to the channel
            channel.send({
                content: `${mentionedRoles} Pending message reports`,
                embeds
            });
        });
    }

    async startUserReportRemovalCronJob(): Promise<void> {
        const ttl = this.data.user_reports?.report_ttl;
        const reportChannelId = this.data.user_reports?.report_channel;

        if (!ttl || !reportChannelId) return;

        const reportChannel = await this.guild.channels
            .fetch(reportChannelId)
            .catch(() => null);

        const stringifiedData = JSON.stringify({ ttl, reportChannelId });

        if (!reportChannel) {
            Logger.error(`Failed to mount user report removal, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!reportChannel.isTextBased()) {
            Logger.error(`Failed to mount user report removal, channel is not text-based: ${stringifiedData}`);
            return;
        }


        // Every hour on the hour
        startCronJob("USER_REPORT_REMOVAL", "0 * * * *", async () => {
            const expiresAt = new Date(Date.now() - ttl);

            const [expiredUserReports] = await prisma.$transaction([
                prisma.userReport.findMany({
                    where: {
                        created_at: { lte: expiresAt },
                        status: UserReportStatus.Unresolved
                    }
                }),
                prisma.userReport.updateMany({
                    where: {
                        created_at: { lte: expiresAt },
                        status: UserReportStatus.Unresolved
                    },
                    data: {
                        status: UserReportStatus.Expired
                    }
                })
            ]);

            if (!expiredUserReports.length) {
                Logger.info("No expired user reports found, no actions need to be taken");
                return;
            }

            Logger.info(`Removing ${expiredUserReports.length} expired user ${pluralize(expiredUserReports.length, "report")}`);

            for (const userReport of expiredUserReports) {
                const alert = await reportChannel.messages.fetch(userReport.id)
                    .catch(() => null);

                alert?.delete().catch(() => null);
            }
        });
    }

    async startUserReportReviewReminderCronJob(): Promise<void> {
        const alertConfig = this.data.user_reports?.alert;
        if (!alertConfig) return;

        const channel = await this.guild.channels
            .fetch(alertConfig.channel_id)
            .catch(() => null);

        const stringifiedData = JSON.stringify(alertConfig);

        if (!channel) {
            Logger.error(`Failed to mount user report review reminders, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!channel.isTextBased()) {
            Logger.error(`Failed to mount user report review reminders, channel is not text-based: ${stringifiedData}`);
            return;
        }

        const getAlertEmbed = (unresolvedReportCount: number): EmbedBuilder => new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle("User Report Review Reminder")
            .setDescription(`There are currently \`${unresolvedReportCount}\` unresolved user reports`)
            .setFooter({ text: `This message appears when there are ${alertConfig.count_threshold}+ unresolved user reports` });

        const mentionedRoles = alertConfig.mentioned_roles
            .map(roleMention)
            .join(" ") || "";

        // Start the cron job for the alert
        startCronJob("USER_REPORT_REVIEW_REMINDER", alertConfig.cron, async () => {
            const unresolvedReportCount = await prisma.userReport.count({
                where: {
                    status: UserReportStatus.Unresolved
                }
            });

            Logger.info(`Count: ${unresolvedReportCount}`);
            Logger.info(`Threshold: ${alertConfig.count_threshold}`);

            if (unresolvedReportCount < alertConfig.count_threshold) {
                Logger.info("Count is below the threshold, no actions need to be taken");
                return;
            }

            Logger.info("Count exceeds the threshold, sending reminder");
            const embeds = [];

            if (alertConfig.embed) {
                embeds.push(getAlertEmbed(unresolvedReportCount));
            }

            // Send the alert to the channel
            channel.send({
                content: `${mentionedRoles} Pending user reports`,
                embeds
            });
        });
    }

    async startMessageReportRemovalCronJob(): Promise<void> {
        const ttl = this.data.message_reports?.report_ttl;
        const reportChannelId = this.data.message_reports?.report_channel;

        if (!ttl || !reportChannelId) return;

        const reportChannel = await this.guild.channels
            .fetch(reportChannelId)
            .catch(() => null);

        const stringifiedData = JSON.stringify({ ttl, reportChannelId });

        if (!reportChannel) {
            Logger.error(`Failed to mount message report removal, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!reportChannel.isTextBased()) {
            Logger.error(`Failed to mount message report removal, channel is not text-based: ${stringifiedData}`);
            return;
        }


        // Every hour on the hour
        startCronJob("MESSAGE_REPORT_REMOVAL", "0 * * * *", async () => {
            const expiresAt = new Date(Date.now() - ttl);

            const [expiredMessageReports] = await prisma.$transaction([
                prisma.messageReport.findMany({
                    where: {
                        created_at: { lte: expiresAt },
                        status: MessageReportStatus.Unresolved
                    }
                }),
                prisma.messageReport.updateMany({
                    where: {
                        created_at: { lte: expiresAt },
                        status: MessageReportStatus.Unresolved
                    },
                    data: {
                        status: MessageReportStatus.Expired
                    }
                })
            ]);

            if (!expiredMessageReports.length) {
                Logger.info("No expired message reports found, no actions need to be taken");
                return;
            }

            Logger.info(`Removing ${expiredMessageReports.length} expired message ${pluralize(expiredMessageReports.length, "report")}`);

            for (const messageReport of expiredMessageReports) {
                const alert = await reportChannel.messages.fetch(messageReport.id)
                    .catch(() => null);

                alert?.delete().catch(() => null);
            }
        });
    }
    /**
     * **All** of the following conditions must be met:
     *
     * - The channel/thread/category ID **is** included in the `include_channels` array
     * - The channel/thread/category ID **is not** included in the `exclude_channels` array
     *
     * @param channel - The channel to check
     * @param scoping - The scoping to check against
     */
    inScope(channel: GuildBasedChannel, scoping: ChannelScoping): boolean {
        const channelData: ChannelScopingParams = {
            categoryId: channel.parentId,
            channelId: channel.id,
            threadId: null
        };

        if (channel.isThread() && channel.parent) {
            channelData.channelId = channel.parent.id;
            channelData.threadId = channel.id;
            channelData.categoryId = channel.parent.parentId;
        }

        return this.channelIsIncludedInScope(channelData, scoping)
            || (scoping.exclude_channels.length > 0 && !this.channelIsExcludedFromScope(channelData, scoping));
    }

    /**
     * Get an array of emojis to add to a message in an auto-reaction channel.
     * The array will be empty if the channel is not an auto-reaction channel.
     *
     * @param channelId - The channel ID to check
     * @returns An array of emojis to add to a message
     */
    getAutoReactionEmojis(channelId: Snowflake): string[] {
        return this.data.auto_reactions.find(reaction => reaction.channel_id === channelId)?.emojis ?? [];
    }

    /**
     * **At least one** of the following conditions must be met:
     *
     * - The channel ID is included in the `include_channels` array
     * - The thread ID is included in the `include_channels` array
     * - The category ID is included in the `include_channels` array
     * - The `include_channels` array is empty
     *
     * @param channelData - The channel data to check
     * @param scoping - The scoping to check against
     * @private
     */
    private channelIsIncludedInScope(channelData: ChannelScopingParams, scoping: ChannelScoping): boolean {
        const { channelId, threadId, categoryId } = channelData;

        return scoping.include_channels.length === 0
            || scoping.include_channels.includes(channelId)
            || (threadId !== null && scoping.include_channels.includes(threadId))
            || (categoryId !== null && scoping.include_channels.includes(categoryId));
    }

    /**
     * **At least one** of the following conditions must be met:
     *
     * - The channel ID is excluded in the `exclude_channels` array
     * - The thread ID is excluded in the `exclude_channels` array
     * - The category ID is excluded in the `exclude_channels` array
     *
     * @param channelData - The channel data to check
     * @param scoping - The scoping to check against
     * @private
     */
    private channelIsExcludedFromScope(channelData: ChannelScopingParams, scoping: ChannelScoping): boolean {
        const { channelId, threadId, categoryId } = channelData;

        return scoping.exclude_channels.includes(channelId)
            || (threadId !== null && scoping.exclude_channels.includes(threadId))
            || (categoryId !== null && scoping.exclude_channels.includes(categoryId));
    }

    /**
     * Check if a member has a specific permission
     *
     * @param member - The guild member to check
     * @param permission - The permission to check for
     */
    hasPermission(member: GuildMember, permission: Permission): boolean {
        return member.roles.cache.some(role => {
            return this.data.permissions.some(permissions => {
                return permissions.roles.includes(role.id) && permissions.allow.includes(permission);
            });
        });
    }

    /**
     * Send a notification to the notification channel of the guild
     *
     * @param message - The message to send
     * @param allowMentions - Whether to allow mentions in the message
     */
    sendNotification(message: string, allowMentions = true): void {
        if (!this.data.notification_channel) return;

        const channel = this.guild.channels
            .cache.get(this.data.notification_channel);

        if (!channel || !channel.isTextBased()) return;

        channel.send({
            content: message,
            allowedMentions: allowMentions ? undefined : { parse: [] }
        });
    }
}

export interface ChannelScopingParams {
    channelId: Snowflake;
    threadId: Snowflake | null;
    categoryId: Snowflake | null;
}