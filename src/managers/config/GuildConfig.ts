import { Snowflake } from "discord-api-types/v10";
import { Colors, EmbedBuilder, Guild, GuildBasedChannel, GuildMember, messageLink, roleMention } from "discord.js";
import { ChannelScoping, Permission, RawGuildConfig, rawGuildConfigSchema } from "./schema";
import { client, prisma } from "@/index";
import { CronJob } from "cron";
import { MessageReportStatus } from "@utils/reports";
import { fromZodError } from "zod-validation-error";
import { InteractionReplyData } from "@utils/types";

import Logger, { AnsiColor } from "@utils/logger";

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
    static async from(guildId: Snowflake, data: unknown): Promise<GuildConfig> {
        const config = GuildConfig.parse(guildId, data);
        const guild = await client.guilds.fetch(guildId).catch(() => {
            throw new Error("Failed to load config, unknown guild ID");
        });

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

            if (!channel) {
                Logger.error(`Failed to mount scheduled message, unknown channel: ${scheduledMessage.channel_id}`);
                continue;
            }

            if (!channel.isTextBased()) {
                Logger.error(`Failed to mount scheduled message, channel is not text-based: ${channel.id}`);
                continue;
            }

            // Start the cron job for the scheduled message
            new CronJob(scheduledMessage.cron, () => {
                channel.send(scheduledMessage.content);
            }).start();

            Logger.log("SCHEDULED_MESSAGES", "Cron job started", {
                color: AnsiColor.Purple
            });
        }
    }

    getQuickResponse(value: string): InteractionReplyData {
        return this.data.quick_responses.find(response => response.value === value)?.response ?? null;
    }

    async startRequestAlertCronJobs(): Promise<void> {
        Logger.info("Starting cron jobs for moderation request alerts...");

        for (const request of this.data.moderation_requests) {
            const alertConfig = request.alert;

            if (!alertConfig) return;

            const channel = await this.guild.channels
                .fetch(alertConfig.channel_id)
                .catch(() => null);

            if (!channel) {
                Logger.error(`Failed to mount moderation request alert, unknown channel: ${alertConfig.channel_id}`);
                continue;
            }

            if (!channel.isTextBased()) {
                Logger.error(`Failed to mount moderation request alert, channel is not text-based: ${channel.id}`);
                continue;
            }

            const getAlertEmbed = (unresolvedRequestCount: number, oldestRequestUrl: string): EmbedBuilder => new EmbedBuilder()
                .setColor(Colors.Red)
                .setTitle("Unreviewed Request Alert")
                .setDescription(`There are currently \`${unresolvedRequestCount}\` unresolved ${request.type} requests starting from ${oldestRequestUrl}`)
                .setFooter({ text: `This message appears when there are ${alertConfig.count_threshold}+ unresolved ${request.type} requests` });

            // Start the cron job for the alert
            new CronJob(alertConfig.cron, async () => {
                const unresolvedRequests = await prisma.moderationRequest.findMany({
                    where: {
                        status: MessageReportStatus.Unresolved,
                        guild_id: this.guild.id
                    },
                    orderBy: {
                        created_at: "asc"
                    }
                });

                if (unresolvedRequests.length < alertConfig.count_threshold) {
                    return;
                }

                const [oldestRequest] = unresolvedRequests;
                const oldestRequestUrl = messageLink(request.channel_id, oldestRequest.id, this.guild.id);
                const alert = getAlertEmbed(unresolvedRequests.length, oldestRequestUrl);

                const mentionedRoles = alertConfig.mentioned_roles
                    .map(roleMention)
                    .join(" ");

                // Send the alert to the channel
                channel.send({
                    content: mentionedRoles || undefined,
                    embeds: [alert]
                });
            }).start();

            Logger.log(`${request.type.toUpperCase()}_REQUEST_ALERT`, "Cron job started", {
                color: AnsiColor.Purple
            });
        }

        Logger.info("Finished starting moderation request alert cron jobs");
    }

    async startMessageReportAlertCronJob(): Promise<void> {
        Logger.info("Starting cron job for message report alerts...");

        const alertConfig = this.data.message_reports?.alert;

        if (!alertConfig) {
            Logger.error("Failed to mount message report alert, missing alert configuration");
            return;
        }

        const channel = await this.guild.channels
            .fetch(alertConfig.channel_id)
            .catch(() => null);

        if (!channel || !channel.isTextBased()) {
            Logger.error(`Failed to mount message report alert, unknown channel: ${alertConfig.channel_id}`);
            return;
        }

        const getAlertEmbed = (unresolvedReportCount: number): EmbedBuilder => new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle("Unresolved Message Report Alert")
            .setDescription(`There are currently \`${unresolvedReportCount}\` unresolved message reports`)
            .setFooter({ text: `This message appears when there are ${alertConfig.count_threshold}+ unresolved message reports` });

        // Start the cron job for the alert
        new CronJob(alertConfig.cron, async () => {
            const unresolvedReportCount = await prisma.messageReport.count({
                where: {
                    status: MessageReportStatus.Unresolved,
                    guild_id: this.guild.id
                }
            });

            if (unresolvedReportCount < alertConfig.count_threshold) {
                return;
            }

            const alert = getAlertEmbed(unresolvedReportCount);
            const mentionedRoles = alertConfig.mentioned_roles
                .map(roleMention)
                .join(" ");

            // Send the alert to the channel
            channel.send({
                content: mentionedRoles || undefined,
                embeds: [alert]
            });
        }).start();

        Logger.log("MESSAGE_REPORT_ALERT", "Cron job started", {
            color: AnsiColor.Purple
        });
    }

    async startMessageReportRemovalCronJob(): Promise<void> {
        const ttl = this.data.message_reports?.alert_ttl;
        const alertChannelId = this.data.message_reports?.alert_channel;

        if (!ttl || !alertChannelId) return;

        const alertChannel = await this.guild.channels
            .fetch(alertChannelId)
            .catch(() => null);

        if (!alertChannel || !alertChannel.isTextBased()) {
            Logger.error(`Failed to start message report removal cron job, unknown channel: ${alertChannelId}`);
            return;
        }

        // Every hour on the hour
        new CronJob("0 * * * *", async () => {
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

            for (const messageReport of expiredMessageReports) {
                const alert = await alertChannel.messages.fetch(messageReport.id)
                    .catch(() => null);

                alert?.delete().catch(() => null);
            }
        }).start();

        Logger.log("MESSAGE_REPORT_REMOVAL", "Cron job started", {
            color: AnsiColor.Purple
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

        return this.channelIsIncludedInScope(channelData, scoping) && !this.channelIsExcludedFromScope(channelData, scoping);
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