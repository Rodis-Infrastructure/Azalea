import { Snowflake } from "discord-api-types/v10";
import { Colors, EmbedBuilder, Guild, GuildBasedChannel, GuildMember, messageLink, roleMention } from "discord.js";
import { client, prisma } from "@/index";
import { CronJob } from "cron";
import { DeepPartial } from "@utils/types";

import _ from "lodash";
import { MessageReportStatus } from "@utils/reports";
import Logger, { AnsiColor } from "@utils/logger";

export default class GuildConfig {
    private constructor(public readonly data: RawGuildConfig, public readonly guild: Guild) {}

    // Initiate the guild configuration with default values
    static async bind(guildId: Snowflake, data: DeepPartial<RawGuildConfig>): Promise<GuildConfig> {
        const guild = await client.guilds.fetch(guildId).catch(() => {
            throw new Error("Failed to load config, unknown guild ID");
        });

        const channelScopingDefaults: ChannelScoping = {
            include_channels: [],
            exclude_channels: []
        };

        const configDefaults: RawGuildConfig = {
            default_purge_amount: 100,
            permissions: [],
            response_ttl: 5000,
            ephemeral_scoping: channelScopingDefaults,
            moderation_requests: [],
            auto_reactions: [],
            media_channels: [],
            scheduled_messages: [],
            user_flags: [],
            emojis: {
                approve: "👍",
                deny: "👎",
                quick_mute_30: "🔇",
                quick_mute_60: "🔇",
                purge_messages: "🗑️",
                report_message: "⚠️"
            },
            logging: {
                default_scoping: channelScopingDefaults,
                logs: []
            }
        };

        // Use lodash to set default values for the guild configuration
        const config: RawGuildConfig = _.defaultsDeep(data, configDefaults);

        // Set default values for each logging configuration
        for (const log of config.logging.logs) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!log.scoping) {
                log.scoping = config.logging.default_scoping;
            } else {
                log.scoping = _.defaults(log.scoping, channelScopingDefaults);
            }
        }

        // Set default values for each permission configuration
        for (const permissions of config.permissions) {
            _.defaults(permissions.roles, []);
            _.defaults(permissions.allow, []);
        }

        for (const moderationRequest of config.moderation_requests) {
            _.defaults(moderationRequest.allow_discord_media_links, true);
        }

        return new GuildConfig(config, guild);
    }

    validate(): void {
        if (this.data.default_purge_amount < 1 || this.data.default_purge_amount > 100) {
            throw new Error("Invalid default purge amount, the value must be between 1 and 100 (inclusive)");
        }

        if (!Number.isInteger(this.data.default_purge_amount)) {
            throw new Error("Invalid default purge amount, the value must be an integer");
        }
    }

    // Start the cron job for each scheduled message
    async startScheduledMessageCronJobs(): Promise<void>{
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
        }
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
                const unresolvedRequests = await prisma.request.findMany({
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

export interface ChannelScoping {
    include_channels: Snowflake[];
    exclude_channels: Snowflake[];
}

export interface ChannelScopingParams {
    channelId: Snowflake;
    threadId: Snowflake | null;
    categoryId: Snowflake | null;
}

interface Log {
    events: LoggingEvent[];
    channel_id: Snowflake;
    scoping: ChannelScoping;
}

interface Logging {
    default_scoping: ChannelScoping;
    logs: Log[];
}

export enum ModerationRequestType {
    Ban = "ban",
    Mute = "mute"
}

export interface ModerationRequest {
    type: ModerationRequestType;
    channel_id: Snowflake;
    // @default true
    allow_discord_media_links: boolean;
    alert?: Alert;
}

interface Alert {
    channel_id: Snowflake;
    // Cron expression for when to send the alert
    cron: string;
    // Number of unreviewed items required to trigger an alert
    count_threshold: number;
    // Role(s) mentioned in the alert
    mentioned_roles: Snowflake[]
}

interface Permissions {
    roles: Snowflake[];
    allow: Permission[]
}

export enum Permission {
    /**
     * ## Grants access to:
     *
     * - Manage infractions not executed by them
     * - View the moderation activity of staff using `/info`
     */
    ManageInfractions = "manage_infractions",
    /**
     * ## Grants access to:
     *
     * - Approve / Deny mute requests
     * - Automatic mutes in ban requests
     */
    ManageMuteRequests = "manage_mute_requests",
    /**
     * ## Grants access to:
     *
     * - Approve / Deny ban requests
     */
    ManageBanRequests = "manage_ban_requests",
    // Grants access to viewing a user's infractions
    ViewInfractions = "view_infractions",
    /**
     * Grants access to viewing the moderation activity of
     * users with the {@link Permission#ViewInfractions} permission
     */
    ViewModerationActivity = "view_moderation_activity"
}

export interface RawGuildConfig {
    logging: Logging;
    moderation_requests: ModerationRequest[];
    auto_reactions: AutoReaction[];
    notification_channel?: Snowflake;
    media_conversion_channel?: Snowflake;
    scheduled_messages: ScheduledMessage[];
    // Flags displayed in the user info message
    user_flags: UserFlag[];
    // Channels that require messages to have an attachment
    media_channels: Snowflake[];
    permissions: Permissions[];
    message_reports?: MessageReports;
    ephemeral_scoping: ChannelScoping;
    // Lifetime of non-ephemeral responses (milliseconds)
    response_ttl: number;
    // Value must be between 1 and 100 (inclusive) - Default: 100
    default_purge_amount: number;
    emojis: Emojis;
}

export interface UserFlag {
    // The name of the flag
    label: string;
    // The user must have at least one of these roles to set the flag
    roles: Snowflake[];
}

interface ScheduledMessage {
    // Channel to send the message in
    channel_id: Snowflake;
    // Cron expression for when to send the message
    cron: string;
    // Message content
    content: string;
}

interface AutoReaction {
    // The channel to listen for messages in
    channel_id: Snowflake;
    // The reactions to add to messages
    emojis: string[];
}

interface MessageReports {
    // Channel to send message reports to
    alert_channel: Snowflake;
    // How long an alert will stay in the alert channel before being removed (in milliseconds)
    alert_ttl?: number;
    // Roles mentioned in new alerts
    mentioned_roles?: Snowflake[];
    // Users with these roles will be immune to message reports
    excluded_roles?: Snowflake[];
}

/**
 * Unicode emoji passed as a string or by ID
 * if they are custom emoji, for example:
 *
 * - `000000000000000000` (custom emoji ID)
 * - `👍` (Unicode emoji)
 */
interface Emojis {
    // Approve moderation requests
    approve: string;
    // Deny moderation requests
    deny: string;
    // 30 minute quick mute
    quick_mute_30: string;
    // 1 hour quick mute
    quick_mute_60: string;
    // Purge a user's messages
    purge_messages: string;
    // Report a message
    report_message: string;
}

interface Database {
    messages: Messages;
}

interface Messages {
    insert_cron: string;
    delete_cron: string;
}

export interface GlobalConfig {
    database: Database;
}

export enum LoggingEvent {
    MessageBulkDelete = "message_bulk_delete",
    MessageDelete = "message_delete",
    MessageUpdate = "message_update",
    MessageReactionAdd = "message_reaction_add",
    InteractionCreate = "interaction_create",
    VoiceJoin = "voice_join",
    VoiceLeave = "voice_leave",
    VoiceSwitch = "voice_switch",
    ThreadCreate = "thread_create",
    ThreadDelete = "thread_delete",
    ThreadUpdate = "thread_update",
    MediaStore = "media_store",
    InfractionCreate = "infraction_create",
    // TODO Implement infraction archive logs
    InfractionArchive = "infraction_archive",
    // TODO Implement infraction update logs
    InfractionUpdate = "infraction_update",
    BanRequestApprove = "ban_request_approve",
    BanRequestDeny = "ban_request_deny",
    MuteRequestApprove = "mute_request_approve",
    MuteRequestDeny = "mute_request_deny",
    // TODO Implement message report create logs
    MessageReportCreate = "message_report_create",
    // TODO Implement message report resolve logs
    MessageReportResolve = "message_report_resolve"
}