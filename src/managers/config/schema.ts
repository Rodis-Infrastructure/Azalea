import { z } from "zod";
import { TypedRegEx } from "typed-regex";
import { MAX_MUTE_DURATION } from "@utils/constants";
import { PermissionFlagsBits, PermissionsString } from "discord.js";

import _ from "lodash";

// ————————————————————————————————————————————————————————————————————————————————
// Misc
// ————————————————————————————————————————————————————————————————————————————————

// Format: "*/5 * * * *" (every 5 minutes)
const cronSchema = z.string().regex(/^(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|([\d*]+[/-]\d+)|\d+|\*) ?){5,7})$/gm);
// Format: "123456789012345678"
const snowflakeSchema = z.string().regex(/^\d{17,19}$/gm);
const massMentionSchema = z.string().regex(/^@?(here|everyone)$/gm);
const roleMentionSchema = z.union([snowflakeSchema, massMentionSchema]);
const emojiSchema = z.union([z.string().emoji(), snowflakeSchema]);
const stringSchema = z.string().min(1);
const domainSchema = z.string().regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/gmi);
const messageContentSchema = stringSchema.min(1).max(4000);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const placeholderString = (placeholders: string[], min = 0, max = Infinity) => {
	return z.string()
		.min(min)
		.max(max)
		.superRefine((value, ctx) => {
			const re = TypedRegEx("\\$(?<placeholder>[A-Z_]+)(?:\\b|$)", "g");
			const invalidPlaceholders = re.captureAll(value)
				.filter((v): v is { placeholder: string } => Boolean(v))
				.map(({ placeholder }) => placeholder)
				.filter(placeholder => !placeholders.includes(placeholder));

			for (const placeholder of invalidPlaceholders) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Invalid placeholder: $${placeholder}`,
					path: ctx.path
				});
			}
		});
};

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
}).superRefine((embed, ctx) => {
	const titleLength = embed.title?.length ?? 0;
	const descriptionLength = embed.description?.length ?? 0;
	const footerTextLength = embed.footer?.text.length ?? 0;
	const authorNameLength = embed.author?.name.length ?? 0;
	const fieldsLength = embed.fields?.reduce((acc, field) => {
		return acc + field.name.length + field.value.length;
	}, 0) ?? 0;

	const totalLength = titleLength + descriptionLength + footerTextLength + authorNameLength + fieldsLength;

	if (totalLength > 6000) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "The total character count of the embed exceeds 6000 characters",
			path: ctx.path
		});
	}
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
    MessagePublish = "message_publish",
    InteractionCreate = "interaction_create",
    VoiceJoin = "voice_join",
    VoiceLeave = "voice_leave",
    VoiceMove = "voice_move",
    ThreadCreate = "thread_create",
    ThreadDelete = "thread_delete",
    ThreadUpdate = "thread_update",
    MemberJoin = "member_join",
    MemberLeave = "member_leave",
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
    TransferInfractions = "transfer_infractions",
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
    // Grants access to managing other users' highlights
    ManageHighlights = "manage_highlights",
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
    ManageRoles = "manage_roles",
    ForwardMessages = "forward_messages"
}

const permissionEnum = z.nativeEnum(Permission);

// ————————————————————————————————————————————————————————————————————————————————
// Guild Config
// ————————————————————————————————————————————————————————————————————————————————

const channelScopingSchema = z.object({
	include_channels: z.array(snowflakeSchema).default([]),
	exclude_channels: z.array(snowflakeSchema).default([])
}).superRefine((scoping, ctx) => {
	const invalidChannelIds = scoping.include_channels.filter(channelId => {
		return scoping.exclude_channels.includes(channelId);
	});

	for (const channelId of invalidChannelIds) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Channel ID ${channelId} is both included and excluded`,
			path: ctx.path
		});
	}
});

const roleScopingSchema = z.object({
	include_roles: z.array(snowflakeSchema).default([]),
	exclude_roles: z.array(snowflakeSchema).default([])
}).superRefine((scoping, ctx) => {
	const invalidRoleIds = scoping.include_roles.filter(roleId => {
		return scoping.exclude_roles.includes(roleId);
	});

	for (const roleId of invalidRoleIds) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Role ID ${roleId} is both included and excluded`,
			path: ctx.path
		});
	}
});

const scopingSchema = z.intersection(channelScopingSchema, roleScopingSchema);

export type ChannelScoping = z.infer<typeof channelScopingSchema>;
export type RoleScoping = z.infer<typeof roleScopingSchema>;
export type Scoping = z.infer<typeof scopingSchema>;

const reviewReminderSchema = z.object({
	channel_id: snowflakeSchema,
	// Cron expression for when to send the reminder - Default: Every hour
	cron: cronSchema.default("0 * * * *"),
	// Whether the reminder should contain an embed
	embed: z.boolean().default(true),
	// Number of unreviewed items required to trigger a reminder - Default: 25
	count_threshold: z.number().min(1).default(25),
	// How old the oldest unreviewed item has to be to trigger a reminder (in milliseconds) - Default: 1 hour
	age_threshold: z.number().min(1000).default(3600000),
	// Role(s) mentioned in the reminders
	mentioned_roles: z.array(roleMentionSchema).max(100).default([])
});

export type ReviewReminder = z.infer<typeof reviewReminderSchema>;

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
	// How long a report will stay in the channel before being removed (in milliseconds)
	report_ttl: z.number().min(1000).optional(),
	review_reminder: reviewReminderSchema.optional(),
	// Roles mentioned in new reports
	mentioned_roles: z.array(roleMentionSchema).nonempty().optional(),
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

const clientEmojisSchema = z.object({
	checkmark: snowflakeSchema.optional(),
	warning: snowflakeSchema.optional(),
	alert: snowflakeSchema.optional()
});

const logSchema = z.object({
	events: z.array(loggingEventEnum).nonempty(),
	channel_id: snowflakeSchema,
	scoping: scopingSchema.default({})
});

const loggingSchema = z.object({
	default_scoping: scopingSchema.default({}),
	logs: z.array(logSchema).default([])
});

const defaultLogging = loggingSchema.parse({});

const moderationRequestSchema = z.object({
	channel_id: snowflakeSchema,
	review_reminder: reviewReminderSchema.optional()
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
}).superRefine((mediaChannel, ctx) => {
	const invalidRoleIds = mediaChannel.allowed_roles?.filter(roleId => {
		return mediaChannel.exclude_roles.includes(roleId);
	}) ?? [];

	for (const roleId of invalidRoleIds) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Role ID ${roleId} is both allowed and excluded`,
			path: ctx.path
		});
	}
});

const nicknameCensorshipSchema = z.object({
	exclude_roles: z.array(snowflakeSchema).max(25).default([]),
	exclusion_response: messageContentSchema.default("You do not have permission to censor this user's nickname."),
	/**
     * The nickname to set when a user's nickname is censored
     *
     * ## Args
     *
     * - `$RAND`: A random 5-digit number
     * - `$USER_ID`: The ID of the user
     */
	nickname: placeholderString(["RAND", "USER_ID"], 1, 32).default("Censored User $RAND")
});

const infractionReasonsSchema = z.object({
	// Domains to blacklist in infraction reasons
	exclude_domains: z.object({
		/**
         * The message to send when a blacklisted domain is found in the reason
         *
         * ## Args
         *
         * - `$DOMAIN`: The blacklisted domain
         */
		failure_message: messageContentSchema.default("The reason contains a blacklisted domain: `$DOMAIN`"),
		domains: z.array(domainSchema).default([])
	}).default({}),
	// Channels to blacklist in infraction reasons
	message_links: z.object({
		scoping: channelScopingSchema.default({}),
		/**
         * The message to send when a blacklisted channel is found in the reason
         *
         * ## Args
         *
         * - `$CHANNEL_ID`: The ID of the blacklisted channel
         * - `$CHANNEL_NAME`: The name of the blacklisted channel
         */
		failure_message: placeholderString(["CHANNEL_ID", "CHANNEL_NAME"], 1, 4000)
			.default("The reason contains a link to a message in a blacklisted channel: <#$CHANNEL_ID> (`$CHANNEL_NAME`)")
	}).default({})
});

export type InfractionReasons = z.infer<typeof infractionReasonsSchema>;

const discordPermissions = Object.keys(PermissionFlagsBits) as unknown as readonly [
    PermissionsString,
    ...PermissionsString[]
];

const discordPermissionsSchema = z.enum(discordPermissions)
	.array()
	.default([]);

const permissionOverwriteSchema = z.object({
	id: snowflakeSchema,
	allow: discordPermissionsSchema,
	deny: discordPermissionsSchema
}).superRefine((overwrite, ctx) => {
	// At least one of allow, deny, or unset must be set
	if (!overwrite.allow.length && !overwrite.deny.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "At least one of allow, deny, or unset must be set",
			path: ctx.path
		});
		return;
	}

	// Permissions cannot be included in more than one property
	const invalidPermissions = _.intersection(overwrite.allow, overwrite.deny);

	for (const permission of invalidPermissions) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Permission ${permission} is included in more than one overwrite property`,
			path: ctx.path
		});
	}
});

export type PermissionOverwrite = z.infer<typeof permissionOverwriteSchema>;

const lockdownChannelOverrideSchema = z.object({
	channel_id: snowflakeSchema,
	permission_overwrites: z.array(permissionOverwriteSchema).optional()
});

const lockdownSchema = z.object({
	default_permission_overwrites: z.array(permissionOverwriteSchema).optional(),
	channels: z.array(lockdownChannelOverrideSchema).nonempty()
}).superRefine((lockdown, ctx) => {
	const channelIds = lockdown.channels.map(channel => channel.channel_id);
	const uniqueChannelIds = new Set(channelIds);

	// Channel IDs must be unique
	if (uniqueChannelIds.size !== channelIds.length) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Channel IDs must be unique",
			path: ctx.path
		});
	}

	// At least one of default_permission_overwrites or permission_overwrites must be set
	for (const channel of lockdown.channels) {
		if (!channel.permission_overwrites && !lockdown.default_permission_overwrites) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "At least one of default_permission_overwrites or permission_overwrites must be set",
				path: ctx.path
			});
		}
	}
});

export type Lockdown = z.infer<typeof lockdownSchema>;

const stageEventOverrideSchema = z.object({
	// ID of the stage channel to monitor for events
	stage_id: snowflakeSchema,
	// Channels affected by the override
	channels: z.array(snowflakeSchema).nonempty(),
	// Roles affected by the override
	roles: z.array(snowflakeSchema).nonempty()
});

// Guild config schema exported for validation
export const rawGuildConfigSchema = z.object({
	logging: loggingSchema.default(defaultLogging),
	ban_requests: moderationRequestSchema.optional(),
	mute_requests: moderationRequestSchema.optional(),
	infraction_reasons: infractionReasonsSchema.default({}),
	// Automatically publish announcement messages in these channels
	auto_publish_announcements: z.array(snowflakeSchema).default([]),
	auto_reactions: z.array(autoReactionSchema).default([]),
	// Toggle the `SendMessages` permission in a channel depending on whether a stage event is active
	stage_event_overrides: z.array(stageEventOverrideSchema).default([]),
	notification_channel: snowflakeSchema.optional(),
	lockdown: lockdownSchema.optional(),
	media_conversion_channel: snowflakeSchema.optional(),
	// Period of time to delete messages on ban (in days) - Default: 0 (disabled)
	delete_message_days_on_ban: z.number().max(7).default(0),
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
	ephemeral_scoping: channelScopingSchema.default({}),
	moderation_activity_ephemeral_scoping: channelScopingSchema.default({}),
	// Lifetime of non-ephemeral responses (milliseconds)
	// default: 3 seconds (3000ms)
	response_ttl: z.number().min(1000).default(3000),
	emojis: emojisSchema.optional(),
	client_emojis: clientEmojisSchema.default({}),
	default_mute_duration_seconds: z.number()
		.min(1)
		.max(MAX_MUTE_DURATION / 1000)
		.default(MAX_MUTE_DURATION / 1000),
	// Value must be between 1 and 100 (inclusive) - Default: 100
	default_purge_amount: z.number()
		.min(1)
		.max(100)
		.default(100)
});

export type RawGuildConfig = z.infer<typeof rawGuildConfigSchema>;