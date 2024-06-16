import {
    Collection,
    Colors,
    Embed,
    EmbedBuilder,
    Guild,
    GuildBasedChannel,
    GuildMember,
    hyperlink,
    messageLink,
    Role,
    roleMention,
    time,
    TimestampStyles
} from "discord.js";

import {
    ReviewReminder,
    Scoping,
    Permission,
    RawGuildConfig,
    rawGuildConfigSchema,
    ChannelScoping,
    RoleScoping
} from "./schema";

import { client, prisma } from "@/index";
import { MessageReportStatus, UserReportStatus } from "@utils/reports";
import { fromZodError } from "zod-validation-error";
import { pluralize, randInt, startCronJob } from "@/utils";
import { Snowflake } from "discord-api-types/v10";
import { LOG_ENTRY_DATE_FORMAT } from "@utils/constants";
import { MuteRequestStatus } from "@utils/muteRequests";
import { BanRequestStatus } from "@utils/banRequests";
import { TypedRegEx } from "typed-regex";
import { capitalize } from "lodash";

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
        for (const schedule of this.data.scheduled_messages) {
            const channel = await this.guild.channels
                .fetch(schedule.channel_id)
                .catch(() => null);

            const stringifiedData = JSON.stringify(schedule);

            if (!channel) {
                Logger.error(`Failed to mount scheduled message, unknown channel.\ndata: ${stringifiedData}`);
                continue;
            }

            if (!channel.isTextBased()) {
                Logger.error(`Failed to mount scheduled message, channel is not text-based.\ndata: ${stringifiedData}`);
                continue;
            }

            // Start the cron job for the scheduled message
            startCronJob(`SCHEDULED_MESSAGE_${schedule.monitor_slug}`, schedule.cron, () => {
                const randomMessageIdx = randInt(0, schedule.messages.length - 1);
                const randomMessage = schedule.messages[randomMessageIdx];
                const stringifiedMessage = JSON.stringify(randomMessage);

                Logger.info(`Sending messages[${randomMessageIdx}] in #${channel.name} (${channel.id}): ${stringifiedMessage}`);

                if (typeof randomMessage === "string") {
                    channel.send(randomMessage);
                } else {
                    channel.send({ embeds: [randomMessage] });
                }
            });
        }
    }

    async startMuteRequestReviewReminderCronJobs(): Promise<void> {
        const config = this.data.mute_requests;
        if (!config?.review_reminder) return;

        const reviewReminderChannel = await this.guild.channels
            .fetch(config.review_reminder.channel_id)
            .catch(() => null);

        const stringifiedData = JSON.stringify(config);

        if (!reviewReminderChannel) {
            Logger.error(`Failed to mount mute request review reminders, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!reviewReminderChannel.isTextBased()) {
            Logger.error(`Failed to mount mute request review reminders, channel is not text-based: ${stringifiedData}`);
            return;
        }

        const mentionedRoles = config.review_reminder.mentioned_roles
            .map(roleMention)
            .join(" ") || "";

        // Start the cron job for the review reminder
        startCronJob("MUTE_REQUEST_REVIEW_REMINDER", config.review_reminder.cron, async () => {
            const unresolvedRequests = await prisma.muteRequest.findMany({
                where: {
                    status: MuteRequestStatus.Pending,
                    guild_id: this.guild.id
                },
                orderBy: { created_at: "asc" }
            });

            const oldestRequest = unresolvedRequests.at(0);
            const oldestRequestURL = oldestRequest && messageLink(config.channel_id, oldestRequest.id, this.guild.id);

            const reminder = GuildConfig._entityExceedsReminderThresholds({
                name: "mute request",
                count: unresolvedRequests.length,
                createdAt: oldestRequest?.created_at,
                oldestEntityURL: oldestRequestURL,
                config: config.review_reminder!
            });

            if (!reminder) return;

            reviewReminderChannel.send({
                content: `${mentionedRoles} Pending mute ${pluralize(unresolvedRequests.length, "request")}`,
                embeds: config.review_reminder!.embed ? [reminder] : undefined
            });
        });
    }

    async startBanRequestReviewReminderCronJobs(): Promise<void> {
        const config = this.data.ban_requests;
        if (!config?.review_reminder) return;

        const reviewReminderChannel = await this.guild.channels
            .fetch(config.review_reminder.channel_id)
            .catch(() => null);

        const stringifiedData = JSON.stringify(config);

        if (!reviewReminderChannel) {
            Logger.error(`Failed to mount ban request review reminders, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!reviewReminderChannel.isTextBased()) {
            Logger.error(`Failed to mount ban request review reminders, channel is not text-based: ${stringifiedData}`);
            return;
        }

        const mentionedRoles = config.review_reminder.mentioned_roles
            .map(roleMention)
            .join(" ") || "";

        // Start the cron job for the review reminder
        startCronJob("BAN_REQUEST_REVIEW_REMINDER", config.review_reminder.cron, async () => {
            const unresolvedRequests = await prisma.banRequest.findMany({
                where: {
                    status: BanRequestStatus.Pending,
                    guild_id: this.guild.id
                },
                orderBy: { created_at: "asc" }
            });

            const oldestRequest = unresolvedRequests.at(0);
            const oldestRequestURL = oldestRequest && messageLink(config.channel_id, oldestRequest.id, this.guild.id);

            const reminder = GuildConfig._entityExceedsReminderThresholds({
                name: "ban request",
                count: unresolvedRequests.length,
                createdAt: oldestRequest?.created_at,
                oldestEntityURL: oldestRequestURL,
                config: config.review_reminder!
            });

            if (!reminder) return;

            reviewReminderChannel.send({
                content: `${mentionedRoles} Pending ban ${pluralize(unresolvedRequests.length, "request")}`,
                embeds: config.review_reminder!.embed ? [reminder] : undefined
            });
        });
    }

    /**
     * Check whether a reminder needs to be sent.
     * The following checks are performed:
     *
     * - Does the entity count exceed the threshold?
     * - Is the oldest entity older than the age threshold?
     *
     * @param data.name - The name of the entity
     * @param data.count - The count of the entity
     * @param data.oldestEntityURL - The URL of the oldest entity
     * @param data.createdAt - The creation date of the oldest entity
     * @param data.config - The reminder configuration for the entity
     * @returns The reminder embed to send if the entity exceeds the thresholds
     * @private
     */
    private static _entityExceedsReminderThresholds(data: {
        name: string,
        count: number,
        oldestEntityURL?: string,
        createdAt?: Date,
        config: ReviewReminder
    }): EmbedBuilder | null {
        const { count, createdAt, config, name } = data;
        const capitalizedName = capitalize(name);
        const createdAtDateThreshold = new Date(Date.now() - config.age_threshold);
        const fullyCapitalizedName = name
            .split(" ")
            .map(capitalize)
            .join(" ");

        const oldestEntityHyperlink = hyperlink("here", data.oldestEntityURL ?? "");
        const reminder = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle(`${fullyCapitalizedName} Review Reminder`)
            .setDescription(`There ${pluralize(count, "is", "are")} currently \`${count}\` unresolved ${pluralize(count, name)}, starting from ${oldestEntityHyperlink}`)
            .setFields({
                name: "Reminder Conditions",
                value: "This reminder is sent whenever **at least one** of the following conditions is met:\n\n" +
                    `- There ${pluralize(config.count_threshold, "is", "are")} ${config.count_threshold}+ unresolved ${pluralize(config.count_threshold, name)}\n` +
                    `- The oldest ${name} was created before ${time(createdAtDateThreshold, TimestampStyles.ShortDateTime)}`
            })
            .setTimestamp();

        Logger.info(`${capitalizedName} count: ${count}`);
        Logger.info(`${capitalizedName} count threshold: ${config.count_threshold}`);

        if (count < config.count_threshold) {
            Logger.info(`${capitalizedName} count is below the threshold, no actions need to be taken`);
        } else {
            Logger.info(`${capitalizedName} count exceeds the threshold, sending review reminder`);
            return reminder;
        }

        if (!createdAt) return null;

        const now = Date.now();
        const createdAtFormatted = createdAt.toLocaleString(undefined, LOG_ENTRY_DATE_FORMAT);
        const createdAtThreshold = createdAtDateThreshold.toLocaleString(undefined, LOG_ENTRY_DATE_FORMAT);
        const age = now - createdAt.getTime();

        Logger.info(`Oldest ${name} created at: ${createdAtFormatted}`);
        Logger.info(`${capitalizedName} created at threshold: ${createdAtThreshold}`);

        if (age > config.age_threshold) {
            Logger.info(`Oldest ${name} exceeds the age threshold, sending review reminder`);
            return reminder;
        } else {
            Logger.info(`Oldest ${name} is below the age threshold, no actions need to be taken`);
        }

        return null;
    }

    async startMessageReportReviewReminderCronJob(): Promise<void> {
        const reviewReminderConfig = this.data.message_reports?.review_reminder;
        const reportChannelId = this.data.message_reports?.report_channel;

        if (!reviewReminderConfig || !reportChannelId) return;

        const reviewReminderChannel = await this.guild.channels
            .fetch(reviewReminderConfig.channel_id)
            .catch(() => null);

        const stringifiedData = JSON.stringify(reviewReminderConfig);

        if (!reviewReminderChannel) {
            Logger.error(`Failed to mount message report review reminders, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!reviewReminderChannel.isTextBased()) {
            Logger.error(`Failed to mount message report review reminders, channel is not text-based: ${stringifiedData}`);
            return;
        }

        const mentionedRoles = reviewReminderConfig.mentioned_roles
            .map(roleMention)
            .join(" ") || "";

        // Start the cron job for the review reminder
        startCronJob("MESSAGE_REPORT_REVIEW_REMINDER", reviewReminderConfig.cron, async () => {
            const unresolvedReports = await prisma.messageReport.findMany({
                where: { status: MessageReportStatus.Unresolved },
                orderBy: { created_at: "asc" }
            });

            const oldestReport = unresolvedReports.at(0);
            const oldestReportURL = oldestReport && messageLink(reportChannelId, oldestReport.id, this.guild.id);

            const reminder = GuildConfig._entityExceedsReminderThresholds({
                name: "message report",
                count: unresolvedReports.length,
                createdAt: oldestReport?.created_at,
                oldestEntityURL: oldestReportURL,
                config: reviewReminderConfig
            });

            if (!reminder) return;

            reviewReminderChannel.send({
                content: `${mentionedRoles} Pending message ${pluralize(unresolvedReports.length, "report")}`,
                embeds: reviewReminderConfig.embed ? [reminder] : undefined
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
                const reminder = await reportChannel.messages.fetch(userReport.id)
                    .catch(() => null);

                reminder?.delete().catch(() => null);
            }
        });
    }

    async startUserReportReviewReminderCronJob(): Promise<void> {
        const reviewReminderConfig = this.data.user_reports?.review_reminder;
        const reportChannelId = this.data.user_reports?.report_channel;

        if (!reviewReminderConfig || !reportChannelId) return;

        const reviewReminderChannel = await this.guild.channels
            .fetch(reviewReminderConfig.channel_id)
            .catch(() => null);

        const stringifiedData = JSON.stringify(reviewReminderConfig);

        if (!reviewReminderChannel) {
            Logger.error(`Failed to mount user report review reminders, unknown channel: ${stringifiedData}`);
            return;
        }

        if (!reviewReminderChannel.isTextBased()) {
            Logger.error(`Failed to mount user report review reminders, channel is not text-based: ${stringifiedData}`);
            return;
        }

        const mentionedRoles = reviewReminderConfig.mentioned_roles
            .map(roleMention)
            .join(" ") || "";

        // Start the cron job for the review reminder
        startCronJob("USER_REPORT_REVIEW_REMINDER", reviewReminderConfig.cron, async () => {
            const unresolvedReports = await prisma.userReport.findMany({
                where: { status: UserReportStatus.Unresolved },
                orderBy: { created_at: "asc" }
            });

            const oldestReport = unresolvedReports.at(0);
            const oldestReportURL = oldestReport && messageLink(reportChannelId, oldestReport.id, this.guild.id);

            const reminder = GuildConfig._entityExceedsReminderThresholds({
                name: "user report",
                count: unresolvedReports.length,
                createdAt: oldestReport?.created_at,
                oldestEntityURL: oldestReportURL,
                config: reviewReminderConfig
            });

            if (!reminder) return;

            reviewReminderChannel.send({
                content: `${mentionedRoles} Pending user ${pluralize(unresolvedReports.length, "report")}`,
                embeds: reviewReminderConfig.embed ? [reminder] : undefined
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
                const reminder = await reportChannel.messages.fetch(messageReport.id)
                    .catch(() => null);

                reminder?.delete().catch(() => null);
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
     * @param member - The member to check
     * @param scoping - The scoping to check against, defaults to ephemeral scoping
     */
    inScope(channel: GuildBasedChannel, member: GuildMember | null, scoping: Scoping): boolean {
        const channelInScope = this.channelInScope(channel, {
            include_channels: scoping.include_channels,
            exclude_channels: scoping.exclude_channels
        });

        if (scoping.include_roles.length || scoping.exclude_roles.length) {
            if (!member) return false;

            return channelInScope && this.roleInScope(member, {
                include_roles: scoping.include_roles,
                exclude_roles: scoping.exclude_roles
            });
        }

        return channelInScope;
    }

    /**
     * Get an array of emojis to add to a message in an auto-reaction channel.
     * The array will be empty if the channel is not an auto-reaction channel.
     *
     * @param channelId - The channel ID to check
     * @param roles - The roles of the user to check
     * @returns An array of emojis to add to a message
     */
    getAutoReactionEmojis(channelId: Snowflake, roles: Collection<Snowflake, Role>): string[] {
        return this.data.auto_reactions.find(reaction => {
            return reaction.channel_id === channelId && !roles.some(role => reaction.exclude_roles.includes(role.id));
        })?.reactions ?? [];
    }

    /**
     * Check if a channel is in scope
     *
     * @param channel - The channel to check
     * @param scoping - The scoping to check against, defaults to ephemeral scoping
     */
    channelInScope(channel: GuildBasedChannel, scoping: ChannelScoping = this.data.ephemeral_scoping): boolean {
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

        if (!scoping.exclude_channels.length) {
            return this._channelIsIncludedInScope(channelData, scoping);
        }

        return this._channelIsIncludedInScope(channelData, scoping) && !this._channelIsExcludedFromScope(channelData, scoping);
    }

    /**
     * Check if a member is in scope
     *
     * @param member - The guild member to check
     * @param scoping - The scoping to check against
     */
    roleInScope(member: GuildMember, scoping: RoleScoping): boolean {
        return this._memberIsIncludedInScope(member, scoping) && !this._memberIsExcludedFromScope(member, scoping);
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
    private _channelIsIncludedInScope(channelData: ChannelScopingParams, scoping: ChannelScoping): boolean {
        const { channelId, threadId, categoryId } = channelData;

        return !scoping.include_channels.length
            || scoping.include_channels.includes(channelId)
            || (threadId !== null && scoping.include_channels.includes(threadId))
            || (categoryId !== null && scoping.include_channels.includes(categoryId));
    }

    /**
     * **At least one** of the following conditions must be met:
     *
     * - The member has a role that is included in the `include_roles` array
     * - The `include_roles` array is empty
     *
     * @param member - The guild member to check
     * @param scoping - The scoping to check against
     * @private
     */
    private _memberIsIncludedInScope(member: GuildMember, scoping: RoleScoping): boolean {
        return !scoping.include_roles.length
            || member.roles.cache.some(role => scoping.include_roles.includes(role.id));
    }

    /**
     * **At least one** of the following conditions must be met:
     *
     * - The member has a role that is excluded in the `exclude_roles` array
     *
     * @param member - The guild member to check
     * @param scoping - The scoping to check against
     * @private
     */
    private _memberIsExcludedFromScope(member: GuildMember, scoping: RoleScoping): boolean {
        return member.roles.cache.some(role => scoping.exclude_roles.includes(role.id));
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
    private _channelIsExcludedFromScope(channelData: ChannelScopingParams, scoping: ChannelScoping): boolean {
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

    canManageRoleRequest(member: GuildMember, request: Embed): boolean {
        const re = TypedRegEx("(?<authorId>\\d{17,19})\\)$");
        const authorId = re.captures(request.data.author!.name)?.authorId;

        return member.id === authorId || this.hasPermission(member, Permission.ManageRoleRequests);
    }

    /**
     * Send a notification to the notification channel of the guild
     *
     * @param message - The message to send
     * @param allowMentions - Whether to allow mentions in the message (true by default)
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