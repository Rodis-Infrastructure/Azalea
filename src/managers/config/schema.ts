import { z } from "zod";

// ————————————————————————————————————————————————————————————————————————————————
// Misc
// ————————————————————————————————————————————————————————————————————————————————

// Format: "*/5 * * * *" (every 5 minutes)
const cronSchema = z.string().regex(/^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|([\d*]+[/-]\d+)|\d+|\*) ?){5,7})$/gm);
// Format: "123456789012345678"
const snowflakeSchema = z.string().regex(/^\d{17,19}$/gm);
const emojiSchema = z.union([z.string().emoji(), snowflakeSchema]);
const stringSchema = z.string().min(1);
const domainSchema = z.string().regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/gmi);
const messageContentSchema = stringSchema.max(4000);

// ————————————————————————————————————————————————————————————————————————————————
// Global Config
// ————————————————————————————————————————————————————————————————————————————————

// Global config schema exported for validation
export const globalConfigSchema = z.object({
    database: z.object({
        messages: z.object({
            insert_cron: cronSchema,
            delete_cron: cronSchema,
            // How long messages should be stored for (in milliseconds) - Default: 7 days
            ttl: z.number().min(1000).default(604800000)
        })
    })
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

// ————————————————————————————————————————————————————————————————————————————————
// Embed
// ————————————————————————————————————————————————————————————————————————————————

const embedFooterSchema = z.object({
    text: stringSchema.max(2048),
    icon_url: z.string().url().optional()
});

const embedFieldSchema = z.object({
    name: stringSchema.max(256),
    value: stringSchema.max(1024),
    inline: z.boolean().optional()
});

const embedAuthorSchema = z.object({
    name: stringSchema.max(256),
    url: z.string().url().optional(),
    icon_url: z.string().url().optional()
});

const embedMediaSchema = z.object({
    url: z.string().url()
});

const embedSchema = z.object({
    title: stringSchema.max(256).optional(),
    description: stringSchema.max(4096).optional(),
    url: z.string().url().optional(),
    color: z.number().optional(),
    footer: embedFooterSchema.optional(),
    author: embedAuthorSchema.optional(),
    fields: z.array(embedFieldSchema).max(25).optional(),
    image: embedMediaSchema.optional(),
    thumbnail: embedMediaSchema.optional()
});

const messageSchema = z.union([messageContentSchema, embedSchema]);

// ————————————————————————————————————————————————————————————————————————————————
// Enums
// ————————————————————————————————————————————————————————————————————————————————

export enum LoggingEvent {
    MessageBulkDelete = "message_bulk_delete",
    MessageDelete = "message_delete",
    MessageUpdate = "message_update",
    MessageReactionAdd = "message_reaction_add",
    InteractionCreate = "interaction_create",
    VoiceJoin = "voice_join",
    VoiceLeave = "voice_leave",
    VoiceMove = "voice_move",
    ThreadCreate = "thread_create",
    ThreadDelete = "thread_delete",
    ThreadUpdate = "thread_update",
    MediaStore = "media_store",
    InfractionCreate = "infraction_create",
    InfractionArchive = "infraction_archive",
    InfractionRestore = "infraction_restore",
    InfractionUpdate = "infraction_update",
    BanRequestApprove = "ban_request_approve",
    BanRequestDeny = "ban_request_deny",
    MuteRequestApprove = "mute_request_approve",
    MuteRequestDeny = "mute_request_deny",
    MessageReportCreate = "message_report_create",
    MessageReportResolve = "message_report_resolve",
    UserReportCreate = "user_report_create",
    UserReportUpdate = "user_report_update",
    UserReportResolve = "user_report_resolve"
}

const loggingEventEnum = z.nativeEnum(LoggingEvent);

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
    // Grants access to resolving message reports
    ManageMessageReports = "manage_message_reports",
    // Grants access to resolving user reports
    ManageUserReports = "manage_user_reports",
    // Grants access to viewing a user's infractions
    ViewInfractions = "view_infractions",
    /**
     * Grants access to viewing the moderation activity of
     * users with the {@link Permission#ViewInfractions} permission
     */
    ViewModerationActivity = "view_moderation_activity",
    // Grants access to purging messages using a reaction
    PurgeMessages = "purge_messages",
    // Grants access to quick muting users using reactions
    QuickMute = "quick_mute",
    // Grants access to reporting messages using a reaction
    ReportMessages = "report_messages",
    // Grants access to managing role requests
    ManageRoleRequests = "manage_role_requests",
}

const permissionEnum = z.nativeEnum(Permission);

export enum ModerationRequestType {
    Ban = "ban",
    Mute = "mute"
}

const moderationRequestTypeEnum = z.nativeEnum(ModerationRequestType);

// ————————————————————————————————————————————————————————————————————————————————
// Guild Config
// ————————————————————————————————————————————————————————————————————————————————

const channelScopingSchema = z.object({
    include_channels: z.array(snowflakeSchema).default([]),
    exclude_channels: z.array(snowflakeSchema).default([])
});

const defaultChannelScoping = channelScopingSchema.parse({});

export type ChannelScoping = z.infer<typeof channelScopingSchema>;

const alertSchema = z.object({
    channel_id: snowflakeSchema,
    // Cron expression for when to send the alert - Default: Every hour
    cron: cronSchema.default("0 * * * *"),
    // Whether the alert should contain an embed
    embed: z.boolean().default(true),
    // Number of unreviewed items required to trigger an alert - Default: 25
    count_threshold: z.number().min(1).default(25),
    // How old the oldest unreviewed item has to be to trigger an alert (in milliseconds) - Default: 1 hour
    age_threshold: z.number().min(1000).default(3600000),
    // Role(s) mentioned in the alert
    mentioned_roles: z.array(snowflakeSchema).max(100).default([])
});

export type Alert = z.infer<typeof alertSchema>;

const userFlagSchema = z.object({
    // The name of the flag
    label: stringSchema.max(50),
    // The user must have at least one of these roles to set the flag
    roles: z.array(snowflakeSchema).nonempty()
});

export type UserFlag = z.infer<typeof userFlagSchema>;

const scheduledMessageSchema = z.object({
    // Channel to send the message in
    channel_id: snowflakeSchema,
    // The slug of the monitor to set
    monitor_slug: z.string().regex(/^[A-Z_]{1,50}$/g),
    // Cron expression for when to send the message
    cron: cronSchema,
    // Message
    messages: messageSchema.array().nonempty()
});

const autoReactionSchema = z.object({
    // The channel to listen for messages in
    channel_id: snowflakeSchema,
    // The reactions to add to messages
    reactions: z.array(emojiSchema).nonempty(),
    exclude_roles: z.array(snowflakeSchema).default([])
});

const reportSchema = z.object({
    // Channel to send reports to
    report_channel: snowflakeSchema,
    // How long an alert will stay in the alert channel before being removed (in milliseconds)
    report_ttl: z.number().min(1000).optional(),
    alert: alertSchema.optional(),
    // Roles mentioned in new alerts
    mentioned_roles: z.array(snowflakeSchema).nonempty().optional(),
    // Users with these roles will be immune to reports
    exclude_roles: z.array(snowflakeSchema).default([])
});

const emojisSchema = z.object({
    // Approve moderation requests
    approve: emojiSchema.optional(),
    // Deny moderation requests
    deny: emojiSchema.optional(),
    // 30 minute quick mute
    quick_mute_30: emojiSchema.optional(),
    // 1 hour quick mute
    quick_mute_60: emojiSchema.optional(),
    // Purge a user's messages
    purge_messages: emojiSchema.optional(),
    // Report a message
    report_message: emojiSchema.optional()
});

const logSchema = z.object({
    events: z.array(loggingEventEnum).nonempty(),
    channel_id: snowflakeSchema,
    scoping: channelScopingSchema.default(defaultChannelScoping)
});

const loggingSchema = z.object({
    default_scoping: channelScopingSchema.default(defaultChannelScoping),
    logs: z.array(logSchema).default([])
});

const defaultLogging = loggingSchema.parse({});

const moderationRequestSchema = z.object({
    type: moderationRequestTypeEnum,
    channel_id: snowflakeSchema,
    alert: alertSchema.optional()
});

const permissionsSchema = z.object({
    roles: z.array(snowflakeSchema).nonempty(),
    allow: z.array(permissionEnum).nonempty()
});

const interactionReplyOptionsSchema = z.object({
    ephemeral: z.boolean().optional(),
    content: messageContentSchema.optional(),
    embeds: z.array(embedSchema).max(10).optional()
});

const quickResponseSchema = z.object({
    // The label displayed in the command's dropdown
    label: stringSchema.max(100),
    value: z.string().regex(/^[\w-]{1,100}$/gm),
    // The response to send when the command is executed
    response: z.union([messageContentSchema, interactionReplyOptionsSchema])
});

const requestedRoleSchema = z.object({
    // The role requested
    id: snowflakeSchema,
    // How long the role should be kept for (in milliseconds)
    // Indefinite if not set
    ttl: z.number().min(1000).optional()
});

const roleRequestsSchema = z.object({
    // The role request channel
    channel_id: snowflakeSchema,
    // Roles that can be requested
    roles: z.array(requestedRoleSchema).nonempty()
});

const mediaChannelSchema = z.object({
    channel_id: snowflakeSchema,
    allowed_roles: z.array(snowflakeSchema).min(1).optional(),
    exclude_roles: z.array(snowflakeSchema).default([]),
    fallback_response: messageContentSchema.optional()
});

const nicknameCensorshipSchema = z.object({
    exclude_roles: z.array(snowflakeSchema).max(25).default([]),
    exclusion_response: messageContentSchema.default("You do not have permission to censor this user's nickname."),
    // $RAND will be replaced with a random 5-digit number
    nickname: stringSchema.max(32).default("Censored User $RAND")
});

const infractionReasonsSchema = z.object({
    // Domains to blacklist in infraction reasons
    exclude_domains: z.object({
        failure_message: messageContentSchema.default("The reason contains a blacklisted domain: `$DOMAIN`"),
        domains: z.array(domainSchema).default([])
    }).default({}),
    // Channels to blacklist in infraction reasons
    message_links: z.object({
        failure_message: messageContentSchema.default("The reason contains a link to a message in a blacklisted channel: <#$CHANNEL_ID> (`$CHANNEL_NAME`)"),
        scoping: channelScopingSchema.default(defaultChannelScoping)
    }).default({})
});

export type InfractionReasons = z.infer<typeof infractionReasonsSchema>;

// Guild config schema exported for validation
export const rawGuildConfigSchema = z.object({
    logging: loggingSchema.default(defaultLogging),
    moderation_requests: z.array(moderationRequestSchema).default([]),
    infraction_reasons: infractionReasonsSchema.default({}),
    auto_reactions: z.array(autoReactionSchema).default([]),
    notification_channel: snowflakeSchema.optional(),
    media_conversion_channel: snowflakeSchema.optional(),
    // Period of time to delete messages on ban (in seconds) - Default: 0 (disabled)
    delete_message_seconds_on_ban: z.number().max(604800).default(0),
    nickname_censorship: nicknameCensorshipSchema.default({}),
    quick_responses: z.array(quickResponseSchema).max(25).default([]),
    role_requests: roleRequestsSchema.optional(),
    scheduled_messages: z.array(scheduledMessageSchema).default([]),
    // Flags displayed in the user info message
    user_flags: z.array(userFlagSchema).max(18).default([]),
    // Channels that require messages to have an attachment
    media_channels: z.array(mediaChannelSchema).default([]),
    permissions: z.array(permissionsSchema).default([]),
    message_reports: reportSchema.optional(),
    user_reports: reportSchema.optional(),
    ephemeral_scoping: channelScopingSchema.default(defaultChannelScoping),
    moderation_activity_ephemeral_scoping: channelScopingSchema.default(defaultChannelScoping),
    // Lifetime of non-ephemeral responses (milliseconds)
    // default: 3 seconds (3000ms)
    response_ttl: z.number().min(1000).default(3000),
    emojis: emojisSchema.optional(),
    // Value must be between 1 and 100 (inclusive) - Default: 100
    default_purge_amount: z.number()
        .min(1)
        .max(100)
        .default(100)
});

export type RawGuildConfig = z.infer<typeof rawGuildConfigSchema>;