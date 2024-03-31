import { Snowflake } from "discord-api-types/v10";
import { Guild, GuildBasedChannel, GuildMember } from "discord.js";
import { client } from "@/index";

import _ from "lodash";

export default class GuildConfig {
    private constructor(public readonly data: IGuildConfig, public readonly guild: Guild) {}

    /** Initiate the guild configuration with default values */
    static async bind(guildId: Snowflake, data: unknown): Promise<GuildConfig> {
        const guild = await client.guilds.fetch(guildId).catch(() => {
            throw new Error("Failed to load config, unknown guild ID");
        });

        const channelScopingDefaults: ChannelScoping = {
            include_channels: [],
            exclude_channels: []
        };

        const configDefaults: IGuildConfig = {
            default_purge_amount: 100,
            permissions: [],
            response_ttl: 5000,
            moderation_requests: [],
            ephemeral_scoping: channelScopingDefaults,
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
        const config: IGuildConfig = _.defaultsDeep(data, configDefaults);

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

    /**
     * **All** of the following conditions must be met:
     *
     * - The channel/thread/category ID **is** included in the `include_channels` array
     * - The channel/thread/category ID **is not** included in the `exclude_channels` array
     *
     * @param channel - The channel to check
     */
    inLoggingScope(channel: GuildBasedChannel): boolean {
        const scoping: ChannelScopingParams = {
            categoryId: channel.parentId,
            channelId: channel.id,
            threadId: null
        };

        if (channel.isThread() && channel.parent) {
            scoping.channelId = channel.parent.id;
            scoping.threadId = channel.id;
            scoping.categoryId = channel.parent.parentId;
        }

        return this.channelIsIncluded(scoping) && !this.channelIsExcluded(scoping);
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
     * @private
     */
    private channelIsIncluded(channelData: ChannelScopingParams): boolean {
        const { channelId, threadId, categoryId } = channelData;

        return this.data.ephemeral_scoping.include_channels.length === 0
            || this.data.ephemeral_scoping.include_channels.includes(channelId)
            || (threadId !== null && this.data.ephemeral_scoping.include_channels.includes(threadId))
            || (categoryId !== null && this.data.ephemeral_scoping.include_channels.includes(categoryId));
    }

    /**
     * **At least one** of the following conditions must be met:
     *
     * - The channel ID is excluded in the `exclude_channels` array
     * - The thread ID is excluded in the `exclude_channels` array
     * - The category ID is excluded in the `exclude_channels` array
     *
     * @param channelData - The channel data to check
     * @private
     */
    private channelIsExcluded(channelData: ChannelScopingParams): boolean {
        const { channelId, threadId, categoryId } = channelData;

        return this.data.ephemeral_scoping.exclude_channels.includes(channelId)
            || (threadId !== null && this.data.ephemeral_scoping.exclude_channels.includes(threadId))
            || (categoryId !== null && this.data.ephemeral_scoping.exclude_channels.includes(categoryId));
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
    alert: Alert;
}

interface Alert {
    channel_id: Snowflake;
    // Cron expression for when to send the alert
    cron: string;
    // Number of unreviewed items required to trigger an alert
    count_threshold: number;
    // How old the oldest unreviewed item must be to trigger an alert (in minutes)
    age_threshold: number;
}

interface Permissions {
    roles: Snowflake[];
    allow: Permission[]
}

export enum Permission {
    /*
     * ## Grants access to:
     *
     * - Manage infractions not executed by them
     * - View the moderation activity of staff using `/info`
     */
    ManageInfractions = "manage_infractions",
    /*
     * ## Grants access to:
     *
     * - Approve / Deny mute requests
     * - Automatic mutes in ban requests
     */
    ManageMuteRequests = "manage_mute_requests",
    ManageBanRequests = "manage_ban_requests"
}

interface IGuildConfig {
    logging: Logging;
    moderation_requests: ModerationRequest[];
    notification_channel?: Snowflake;
    permissions: Permissions[];
    ephemeral_scoping: ChannelScoping;
    // Lifetime of non-ephemeral responses (milliseconds)
    response_ttl: number;
    // Value must be between 1 and 100 (inclusive) - Default: 100
    default_purge_amount: number;
    emojis: Emojis;
}

/**
 * Unicode emoji passed as a string or by ID
 * if they are custom emoji, for example:
 *
 * - `000000000000000000` (custom emoji ID)
 * - `👍` (Unicode emoji)
 */
interface Emojis {
    /** Approve moderation requests */
    approve: string;
    /** Deny moderation requests */
    deny: string;
    /** 30 minute quick mute */
    quick_mute_30: string;
    /** 1 hour quick mute */
    quick_mute_60: string;
    /** Purge a user's messages */
    purge_messages: string;
    /** Report a message */
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
    // TODO Implement infraction create logs
    InfractionCreate = "infraction_create",
    // TODO Implement infraction archive logs
    InfractionArchive = "infraction_archive",
    // TODO Implement infraction update logs
    InfractionUpdate = "infraction_update",
    // TODO Implement ban request approve logs
    BanRequestApprove = "ban_request_approve",
    // TODO Implement ban request deny logs
    BanRequestDeny = "ban_request_deny",
    // TODO Implement mute request approve logs
    MuteRequestApprove = "mute_request_approve",
    // TODO Implement mute request deny logs
    MuteRequestDeny = "mute_request_deny",
    // TODO Implement message report create logs
    MessageReportCreate = "message_report_create",
    // TODO Implement message report resolve logs
    MessageReportResolve = "message_report_resolve"
}