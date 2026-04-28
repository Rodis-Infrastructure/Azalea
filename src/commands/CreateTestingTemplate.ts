import {
	ApplicationCommandOptionType,
	AttachmentBuilder,
	ChannelType,
	ChatInputCommandInteraction,
	EmbedBuilder,
	Guild,
	OverwriteResolvable,
	PermissionFlagsBits,
	Snowflake,
	TextChannel
} from "discord.js";

import { CommandResponse } from "@utils/types";
import { readYamlFile } from "@/utils";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";
import GuildConfig from "@managers/config/GuildConfig";
import Logger from "@utils/logger";

const CONFIRMATION_PHRASE = "I understand this will erase all channels and roles";

/**
 * Creates a complete testing environment for the bot by:
 *
 * 1. Deleting all existing channels and roles
 * 2. Creating a full set of channels and roles designed for testing every bot feature
 * 3. Generating a YAML configuration file mapped to the newly created resources
 * 4. Hot-reloading the configuration into memory
 *
 * This command is destructive and requires:
 * - The executor to be the guild owner
 * - The guild to have fewer than 10 members
 * - An exact confirmation phrase as input
 */
export default class CreateTestingTemplate extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "create-testing-template",
			description: "Erase and recreate all channels/roles for a bot testing environment",
			options: [
				{
					name: "confirmation",
					description: `Type: "${CONFIRMATION_PHRASE}"`,
					type: ApplicationCommandOptionType.String,
					required: true
				}
			]
		});
	}

	async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<CommandResponse> {
		// --- Validation ---

		if (interaction.guild.ownerId !== interaction.user.id) {
			return "This command can only be used by the server owner.";
		}

		if (interaction.guild.memberCount >= 10) {
			return "This command can only be used in servers with fewer than 10 members.";
		}

		const confirmation = interaction.options.getString("confirmation", true);

		if (confirmation !== CONFIRMATION_PHRASE) {
			return `Invalid confirmation. You must type exactly:\n\`${CONFIRMATION_PHRASE}\``;
		}

		const me = interaction.guild.members.me;

		if (!me) {
			return "I could not resolve my own guild member. Try again.";
		}

		const requiredPermissions = [
			PermissionFlagsBits.ManageChannels,
			PermissionFlagsBits.ManageRoles,
			PermissionFlagsBits.ManageGuild
		] as const;

		for (const perm of requiredPermissions) {
			if (!me.permissions.has(perm)) {
				return "I need the `Manage Channels`, `Manage Roles`, and `Manage Guild` permissions to run this command.";
			}
		}

		// --- Acknowledge and begin async work ---

		await interaction.reply("Starting testing environment setup. This will take a moment...");

		// Fire-and-forget — the interaction channel will be deleted
		setTimeout(() => {
			CreateTestingTemplate._run(interaction.guild)
				.catch(error => {
					Logger.error(`CreateTestingTemplate failed for guild ${interaction.guildId}: ${error.message}`);
				});
		}, 1000);

		return null;
	}

	private static async _run(guild: Guild): Promise<void> {
		const everyoneRoleId = guild.id;

		// --- Phase 1: Delete existing channels ---

		const failedChannelDeletions: string[] = [];

		for (const [, channel] of guild.channels.cache) {
			await channel.delete("Testing template setup: clearing existing channels")
				.catch(() => {
					failedChannelDeletions.push(`${channel.name} (${channel.id})`);
				});
		}

		// --- Phase 2: Delete existing roles ---

		const failedRoleDeletions: string[] = [];

		for (const [, role] of guild.roles.cache) {
			// Skip @everyone and bot-managed roles
			if (role.id === everyoneRoleId || role.managed) continue;

			await role.delete("Testing template setup: clearing existing roles")
				.catch(() => {
					failedRoleDeletions.push(`${role.name} (${role.id})`);
				});
		}

		// --- Phase 3: Create roles ---

		const adminRole = await guild.roles.create({
			name: "Admin",
			color: 0xE74C3C,
			hoist: true,
			reason: "Testing template: admin role"
		});

		const moderatorRole = await guild.roles.create({
			name: "Moderator",
			color: 0x3498DB,
			hoist: true,
			reason: "Testing template: moderator role"
		});

		const trustedRole = await guild.roles.create({
			name: "Trusted",
			color: 0x2ECC71,
			reason: "Testing template: trusted role"
		});

		const mutedRole = await guild.roles.create({
			name: "Muted",
			color: 0x95A5A6,
			reason: "Testing template: muted role"
		});

		const testAltRole = await guild.roles.create({
			name: "Test Alt",
			color: 0xE67E22,
			reason: "Testing template: alt account role"
		});

		// Assign Admin role to the guild owner
		const owner = await guild.members.fetch(guild.ownerId).catch(() => null);

		if (owner) {
			await owner.roles.add(adminRole, "Testing template: assign admin to owner").catch(() => null);
		}

		// --- Phase 4: Create channels ---

		// Permission overwrite presets
		const staffOnlyOverwrites: OverwriteResolvable[] = [
			{ id: everyoneRoleId, deny: [PermissionFlagsBits.ViewChannel] },
			{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
			{ id: moderatorRole.id, allow: [PermissionFlagsBits.ViewChannel] }
		];

		const readonlyOverwrites: OverwriteResolvable[] = [
			{ id: everyoneRoleId, deny: [PermissionFlagsBits.SendMessages] }
		];

		// ---- README category ----
		const readmeCategory = await guild.channels.create({
			name: "README",
			type: ChannelType.GuildCategory,
			position: 0,
			reason: "Testing template"
		});

		const readmeChannel = await guild.channels.create({
			name: "readme",
			type: ChannelType.GuildText,
			parent: readmeCategory.id,
			permissionOverwrites: readonlyOverwrites,
			reason: "Testing template"
		});

		// ---- GENERAL category ----
		const generalCategory = await guild.channels.create({
			name: "GENERAL",
			type: ChannelType.GuildCategory,
			reason: "Testing template"
		});

		const generalChannel = await guild.channels.create({
			name: "general",
			type: ChannelType.GuildText,
			parent: generalCategory.id,
			reason: "Testing template"
		});

		const botCommandsChannel = await guild.channels.create({
			name: "bot-commands",
			type: ChannelType.GuildText,
			parent: generalCategory.id,
			reason: "Testing template"
		});

		const mediaOnlyChannel = await guild.channels.create({
			name: "media-only",
			type: ChannelType.GuildText,
			parent: generalCategory.id,
			reason: "Testing template"
		});

		// Discord's channel creation endpoint no longer accepts type 5 (GuildAnnouncement).
		// Use the raw value 6 which is the accepted base type for announcement channels.
		const announcementsChannel = await guild.channels.create({
			name: "announcements",
			type: 6 as ChannelType.GuildAnnouncement,
			parent: generalCategory.id,
			reason: "Testing template"
		});

		// ---- MODERATION category ----
		const moderationCategory = await guild.channels.create({
			name: "MODERATION",
			type: ChannelType.GuildCategory,
			permissionOverwrites: staffOnlyOverwrites,
			reason: "Testing template"
		});

		const modChatChannel = await guild.channels.create({
			name: "mod-chat",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		const banRequestsChannel = await guild.channels.create({
			name: "ban-requests",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		const muteRequestsChannel = await guild.channels.create({
			name: "mute-requests",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		const messageReportsChannel = await guild.channels.create({
			name: "message-reports",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		const userReportsChannel = await guild.channels.create({
			name: "user-reports",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		const roleRequestsChannel = await guild.channels.create({
			name: "role-requests",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		const modAlertsChannel = await guild.channels.create({
			name: "mod-alerts",
			type: ChannelType.GuildText,
			parent: moderationCategory.id,
			reason: "Testing template"
		});

		// ---- LOGGING category ----
		const loggingCategory = await guild.channels.create({
			name: "LOGGING",
			type: ChannelType.GuildCategory,
			permissionOverwrites: staffOnlyOverwrites,
			reason: "Testing template"
		});

		const messageLogsChannel = await guild.channels.create({
			name: "message-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		const voiceLogsChannel = await guild.channels.create({
			name: "voice-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		const infractionLogsChannel = await guild.channels.create({
			name: "infraction-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		const mediaLogsChannel = await guild.channels.create({
			name: "media-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		const memberLogsChannel = await guild.channels.create({
			name: "member-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		const reportLogsChannel = await guild.channels.create({
			name: "report-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		const commandLogsChannel = await guild.channels.create({
			name: "command-logs",
			type: ChannelType.GuildText,
			parent: loggingCategory.id,
			reason: "Testing template"
		});

		// ---- VOICE category ----
		const voiceCategory = await guild.channels.create({
			name: "VOICE",
			type: ChannelType.GuildCategory,
			reason: "Testing template"
		});

		await guild.channels.create({
			name: "General",
			type: ChannelType.GuildVoice,
			parent: voiceCategory.id,
			reason: "Testing template"
		});

		await guild.channels.create({
			name: "Staff",
			type: ChannelType.GuildVoice,
			parent: voiceCategory.id,
			permissionOverwrites: staffOnlyOverwrites,
			reason: "Testing template"
		});

		const stageChannel = await guild.channels.create({
			name: "Stage",
			type: ChannelType.GuildStageVoice,
			parent: voiceCategory.id,
			reason: "Testing template"
		});

		// ---- FORUM category ----
		const forumCategory = await guild.channels.create({
			name: "FORUM",
			type: ChannelType.GuildCategory,
			reason: "Testing template"
		});

		await guild.channels.create({
			name: "feedback",
			type: ChannelType.GuildForum,
			parent: forumCategory.id,
			reason: "Testing template"
		});

		// ---- LOCKDOWN category ----
		const lockdownCategory = await guild.channels.create({
			name: "LOCKDOWN TEST",
			type: ChannelType.GuildCategory,
			reason: "Testing template"
		});

		const lockdownChat1 = await guild.channels.create({
			name: "lockdown-chat-1",
			type: ChannelType.GuildText,
			parent: lockdownCategory.id,
			reason: "Testing template"
		});

		const lockdownChat2 = await guild.channels.create({
			name: "lockdown-chat-2",
			type: ChannelType.GuildText,
			parent: lockdownCategory.id,
			reason: "Testing template"
		});

		// ---- AUTO-REACTIONS category ----
		const autoReactCategory = await guild.channels.create({
			name: "AUTO-REACTIONS",
			type: ChannelType.GuildCategory,
			reason: "Testing template"
		});

		const autoReactChannel = await guild.channels.create({
			name: "auto-react-channel",
			type: ChannelType.GuildText,
			parent: autoReactCategory.id,
			reason: "Testing template"
		});

		// --- Phase 5: Generate YAML config ---

		const timestamp = Math.floor(Date.now() / 1000);
		const configYaml = CreateTestingTemplate._generateConfig({
			everyoneRoleId,
			adminRoleId: adminRole.id,
			moderatorRoleId: moderatorRole.id,
			trustedRoleId: trustedRole.id,
			mutedRoleId: mutedRole.id,
			testAltRoleId: testAltRole.id,
			generalChannelId: generalChannel.id,
			botCommandsChannelId: botCommandsChannel.id,
			mediaOnlyChannelId: mediaOnlyChannel.id,
			announcementsChannelId: announcementsChannel.id,
			modChatChannelId: modChatChannel.id,
			banRequestsChannelId: banRequestsChannel.id,
			muteRequestsChannelId: muteRequestsChannel.id,
			messageReportsChannelId: messageReportsChannel.id,
			userReportsChannelId: userReportsChannel.id,
			roleRequestsChannelId: roleRequestsChannel.id,
			modAlertsChannelId: modAlertsChannel.id,
			messageLogsChannelId: messageLogsChannel.id,
			voiceLogsChannelId: voiceLogsChannel.id,
			infractionLogsChannelId: infractionLogsChannel.id,
			mediaLogsChannelId: mediaLogsChannel.id,
			memberLogsChannelId: memberLogsChannel.id,
			reportLogsChannelId: reportLogsChannel.id,
			commandLogsChannelId: commandLogsChannel.id,
			lockdownChat1Id: lockdownChat1.id,
			lockdownChat2Id: lockdownChat2.id,
			autoReactChannelId: autoReactChannel.id,
			stageChannelId: stageChannel.id,
			moderationCategoryId: moderationCategory.id,
			loggingCategoryId: loggingCategory.id
		});

		// --- Phase 6: Write config and reload ---

		const fs = await import("fs");
		const configPath = `configs/${guild.id}.yml`;
		fs.writeFileSync(configPath, configYaml, "utf-8");

		// Hot-reload the config into memory
		const parsedConfig = readYamlFile(configPath);
		const config = await GuildConfig.from(guild.id, parsedConfig).catch(() => null);

		if (config) {
			ConfigManager.addGuildConfig(guild.id, config);
		}

		// --- Phase 7: Post to #readme ---

		const configAttachment = new AttachmentBuilder(Buffer.from(configYaml))
			.setName(`${guild.id}.yml`)
			.setDescription("Generated guild configuration");

		const embed = new EmbedBuilder()
			.setTitle("Testing Environment")
			.setColor(0x5865F2)
			.setDescription([
				`Generated <t:${timestamp}:R>`,
				"",
				"This server has been configured as a testing environment for the bot. " +
				"All channels, roles, and the guild configuration have been auto-generated."
			].join("\n"))
			.addFields(
				{
					name: "Getting Started",
					value: [
						"1. Invite an alt account to test commands that involve other users (mute, ban, report, etc.)",
						`2. Assign <@&${testAltRole.id}> to the alt account`,
						`3. Use <#${botCommandsChannel.id}> for running bot commands`,
						`4. Moderation channels are under the **MODERATION** category`,
						`5. Logs will appear in the **LOGGING** category`
					].join("\n")
				},
				{
					name: "What to Test",
					value: [
						"- **Infractions**: `/warn`, `/mute`, `/ban`, `/kick`, `/note` on the alt account",
						"- **Infraction management**: `/infraction search`, archive, restore, update",
						`- **Ban/Mute requests**: Use the channels under MODERATION`,
						`- **Reports**: Right-click messages/users to report (alt needs <@&${trustedRole.id}> or use reaction emojis)`,
						`- **Lockdown**: \`/lockdown start\` and \`/lockdown end\` affects LOCKDOWN TEST channels`,
						`- **Media channels**: <#${mediaOnlyChannel.id}> requires attachments`,
						`- **Auto-reactions**: Post in <#${autoReactChannel.id}> to see auto-reactions`,
						`- **Role requests**: Request <@&${testAltRole.id}> in <#${roleRequestsChannel.id}>`,
						"- **Highlights**: `/highlight add` to track keywords",
						`- **Nickname censorship**: \`/censor-nickname\` on the alt account`,
						"- **Quick responses**: `/qr` for pre-configured responses",
						"- **Rules**: `/rule` to view sample rules"
					].join("\n")
				},
				{
					name: "Emojis",
					value: "The `emojis` section in the config is commented out. To test reaction-based features " +
						"(approve/deny requests, quick mute, purge, report), upload custom emojis to this server " +
						"and add their IDs to the config file."
				},
				{
					name: "Configuration",
					value: `The config file is attached below and has been saved to \`configs/${guild.id}.yml\`. ` +
						"It was automatically loaded into memory. Edit the file and restart the bot to apply changes."
				}
			);

		await (readmeChannel as TextChannel).send({
			embeds: [embed],
			files: [configAttachment]
		}).catch(error => {
			Logger.error(`CreateTestingTemplate: Failed to send readme message: ${error.message}`);
		});

		// --- Summary log ---

		const summary = [
			`Testing template created for guild ${guild.name} (${guild.id})`,
			`  Roles created: 5`,
			`  Channels created: ~25`,
			`  Failed channel deletions: ${failedChannelDeletions.length}`,
			`  Failed role deletions: ${failedRoleDeletions.length}`,
			`  Config written to: ${configPath}`,
			`  Config loaded: ${config ? "yes" : "no"}`
		].join("\n");

		Logger.info(summary);
	}

	private static _generateConfig(ids: TemplateIds): string {
		return `# *******************************************************
# Testing Environment Configuration
# Generated by /create-testing-template
# *******************************************************

definitions:
  # *******************************************************
  # Roles
  # *******************************************************

  - &roles__everyone "${ids.everyoneRoleId}"
  - &roles__admin "${ids.adminRoleId}"
  - &roles__moderator "${ids.moderatorRoleId}"
  - &roles__trusted "${ids.trustedRoleId}"
  - &roles__muted "${ids.mutedRoleId}"
  - &roles__test-alt "${ids.testAltRoleId}"

  # *******************************************************
  # Role sets
  # *******************************************************

  - &role-set__staff
    - *roles__admin
    - *roles__moderator

  # *******************************************************
  # Text channels
  # *******************************************************

  # General
  - &channels__general "${ids.generalChannelId}"
  - &channels__bot-commands "${ids.botCommandsChannelId}"
  - &channels__media-only "${ids.mediaOnlyChannelId}"
  - &channels__announcements "${ids.announcementsChannelId}"

  # Moderation
  - &channels__mod-chat "${ids.modChatChannelId}"
  - &channels__ban-requests "${ids.banRequestsChannelId}"
  - &channels__mute-requests "${ids.muteRequestsChannelId}"
  - &channels__message-reports "${ids.messageReportsChannelId}"
  - &channels__user-reports "${ids.userReportsChannelId}"
  - &channels__role-requests "${ids.roleRequestsChannelId}"
  - &channels__mod-alerts "${ids.modAlertsChannelId}"

  # Logging
  - &channels__message-logs "${ids.messageLogsChannelId}"
  - &channels__voice-logs "${ids.voiceLogsChannelId}"
  - &channels__infraction-logs "${ids.infractionLogsChannelId}"
  - &channels__media-logs "${ids.mediaLogsChannelId}"
  - &channels__member-logs "${ids.memberLogsChannelId}"
  - &channels__report-logs "${ids.reportLogsChannelId}"
  - &channels__command-logs "${ids.commandLogsChannelId}"

  # Lockdown
  - &channels__lockdown-chat-1 "${ids.lockdownChat1Id}"
  - &channels__lockdown-chat-2 "${ids.lockdownChat2Id}"

  # Auto-reactions
  - &channels__auto-react "${ids.autoReactChannelId}"

  # *******************************************************
  # Stage channels
  # *******************************************************

  - &stages__stage "${ids.stageChannelId}"

  # *******************************************************
  # Categories
  # *******************************************************

  - &categories__moderation "${ids.moderationCategoryId}"
  - &categories__logging "${ids.loggingCategoryId}"

# *******************************************************
# General settings
# *******************************************************

# Channel used for media conversion (e.g., .webp to .png)
media_conversion_channel_id: *channels__bot-commands

# Channel for bot notifications (e.g., scheduled message monitor alerts)
notification_channel_id: *channels__mod-alerts

# Number of messages to purge by default (1-100)
default_purge_amount: 50

# Lifetime of non-ephemeral responses in milliseconds (default: 3000ms)
response_ttl: 5000

# Days of messages to delete on ban (0-7, default: 0)
ban_delete_message_days: 1

# Default mute duration in milliseconds (default: 28 days)
default_mute_duration: 2419200000

# *******************************************************
# Auto-publish announcements
# *******************************************************

# Messages in these announcement channels will be automatically published
auto_publish_announcements:
  - *channels__announcements

# *******************************************************
# Stage event overrides
# *******************************************************

# Toggles SendMessages permission based on stage event activity
stage_event_overrides:
  - stage_id: *stages__stage
    roles:
      - *roles__everyone
    channels:
      - *channels__general

# *******************************************************
# Nickname censorship
# *******************************************************

nickname_censorship:
  nickname: "Censored User $RAND"
  exclusion_response: "You do not have permission to censor this user's nickname."
  exclude_roles: *role-set__staff

# *******************************************************
# Infraction reasons
# *******************************************************

infraction_reasons:
  exclude_domains:
    failure_message: "The reason contains a link with a blacklisted domain: \`$DOMAIN\`"
    domains:
      - example.com

  message_links:
    failure_message: "The reason contains a link to a message in a restricted channel: <#$CHANNEL_ID> (\`#$CHANNEL_NAME\`)"
    scoping:
      include_channels:
        - *categories__moderation
        - *categories__logging

# *******************************************************
# Lockdown
# *******************************************************

# Channels affected by /lockdown start and /lockdown end
lockdown:
  default_permission_overwrites:
    - id: *roles__everyone
      deny:
        - SendMessages
  channels:
    - channel_id: *channels__lockdown-chat-1
    - channel_id: *channels__lockdown-chat-2

# *******************************************************
# Media channels
# *******************************************************

# These channels require messages to have an attachment
media_channels:
  - channel_id: *channels__media-only
    exclude_roles: *role-set__staff

# *******************************************************
# Auto-reactions
# *******************************************************

# Automatically react to messages in these channels
auto_reactions:
  - channel_id: *channels__auto-react
    exclude_roles: *role-set__staff
    reactions:
      - "❤️"
      - "😎"
      - "👍"

# *******************************************************
# Moderation requests
# *******************************************************

# Ban request queue — requires manage_ban_requests permission to approve/deny
ban_requests:
  channel_id: *channels__ban-requests

# Mute request queue — requires manage_mute_requests permission to approve/deny
mute_requests:
  channel_id: *channels__mute-requests

# *******************************************************
# Reports
# *******************************************************

# Message reports — submitted via reaction or context menu
message_reports:
  channel_id: *channels__message-reports
  exclude_roles: *role-set__staff
  mentioned_roles:
    - *roles__moderator

# User reports — submitted via context menu
user_reports:
  channel_id: *channels__user-reports
  exclude_roles: *role-set__staff
  mentioned_roles:
    - *roles__moderator

# *******************************************************
# Role requests
# *******************************************************

# Roles that can be requested via /role request
role_requests:
  channel_id: *channels__role-requests
  roles:
    - id: *roles__test-alt
      ttl: 604800000 # 7 days

# *******************************************************
# Permissions
# *******************************************************

# Maps roles to bot-level permissions
permissions:
  # Admin — full access to all bot features
  - roles:
      - *roles__admin
    allow:
      - report_messages
      - forward_messages
      - view_infractions
      - manage_infractions
      - transfer_infractions
      - view_moderation_activity
      - manage_mute_requests
      - manage_ban_requests
      - manage_role_requests
      - quick_mute
      - purge_messages
      - manage_message_reports
      - manage_user_reports
      - manage_roles
      - manage_highlights

  # Moderator — standard moderation permissions
  - roles:
      - *roles__moderator
    allow:
      - view_infractions
      - forward_messages
      - manage_message_reports
      - manage_user_reports
      - manage_mute_requests
      - quick_mute
      - purge_messages

  # Trusted — can report messages
  - roles:
      - *roles__trusted
    allow:
      - report_messages

# *******************************************************
# Emojis
# *******************************************************

# To test reaction-based features (approve/deny requests, quick mute,
# purge messages, report messages), upload custom emojis to this server
# and uncomment the section below with the correct emoji IDs.
#
# emojis:
#   reactions:
#     approve: "EMOJI_ID"
#     deny: "EMOJI_ID"
#     quick_mute_30: "EMOJI_ID"
#     quick_mute_60: "EMOJI_ID"
#     purge_messages: "EMOJI_ID"
#     report_message: "EMOJI_ID"
#   display:
#     checkmark: "EMOJI_ID"
#     warning: "EMOJI_ID"
#     alert: "EMOJI_ID"

# *******************************************************
# User flags
# *******************************************************

# Flags displayed in the /info command for a user
user_flags:
  - label: "Admin"
    roles:
      - *roles__admin

  - label: "Moderator"
    roles:
      - *roles__moderator

  - label: "Trusted"
    roles:
      - *roles__trusted

  - label: "Muted"
    roles:
      - *roles__muted

  - label: "Test Alt"
    roles:
      - *roles__test-alt

# *******************************************************
# Ephemeral scoping
# *******************************************************

# Controls which channels get ephemeral (hidden) responses
ephemeral_scoping:
  # Default: responses are non-ephemeral in staff channels
  default:
    exclude_channels:
      - *categories__moderation
      - *categories__logging
      - *channels__bot-commands

  # Moderation activity: non-ephemeral in staff channels
  moderation_activity:
    exclude_channels:
      - *categories__moderation

# *******************************************************
# Logging
# *******************************************************

logging:
  # Exclude staff channels from default logging scope
  default_scoping:
    exclude_channels:
      - *categories__moderation
      - *categories__logging

  logs:
    # Message events: deletions, edits, reactions
    - channel_id: *channels__message-logs
      events:
        - message_delete
        - message_bulk_delete
        - message_update
        - message_reaction_add
        - message_publish

    # Command/interaction usage by staff
    - channel_id: *channels__command-logs
      scoping:
        include_roles: *role-set__staff
      events:
        - interaction_create

    # Voice activity
    - channel_id: *channels__voice-logs
      events:
        - voice_join
        - voice_leave
        - voice_move

    # Thread activity
    - channel_id: *channels__message-logs
      events:
        - thread_create
        - thread_delete
        - thread_update

    # Member join/leave
    - channel_id: *channels__member-logs
      events:
        - member_join
        - member_leave

    # Media storage
    - channel_id: *channels__media-logs
      events:
        - media_store

    # Infractions: creation, updates, archiving
    - channel_id: *channels__infraction-logs
      events:
        - infraction_create
        - infraction_archive
        - infraction_restore
        - infraction_update

    # Moderation request outcomes
    - channel_id: *channels__infraction-logs
      events:
        - ban_request_approve
        - ban_request_deny
        - mute_request_approve
        - mute_request_deny

    # Reports
    - channel_id: *channels__report-logs
      events:
        - message_report_create
        - message_report_resolve
        - user_report_create
        - user_report_update
        - user_report_resolve

# *******************************************************
# Rules
# *******************************************************

# Sample rules for testing the /rule command
rules:
  entries:
    - title: "Be respectful"
      content: "Treat all members with respect. No harassment, discrimination, or personal attacks."

    - title: "No spam"
      content: "Do not spam messages, emojis, or mentions. Keep conversations on-topic."

    - title: "Follow Discord ToS"
      content: "All members must adhere to Discord's Terms of Service and Community Guidelines."

# *******************************************************
# Quick responses
# *******************************************************

# Pre-configured responses accessible via /qr
quick_responses:
  - label: "Welcome"
    value: welcome
    response: "Welcome to the server! Please read the rules and enjoy your stay."

  - label: "Testing Info"
    value: testing-info
    response: "This is a testing environment. Feel free to test any bot features here."
`;
	}
}

interface TemplateIds {
	everyoneRoleId: Snowflake;
	adminRoleId: Snowflake;
	moderatorRoleId: Snowflake;
	trustedRoleId: Snowflake;
	mutedRoleId: Snowflake;
	testAltRoleId: Snowflake;
	generalChannelId: Snowflake;
	botCommandsChannelId: Snowflake;
	mediaOnlyChannelId: Snowflake;
	announcementsChannelId: Snowflake;
	modChatChannelId: Snowflake;
	banRequestsChannelId: Snowflake;
	muteRequestsChannelId: Snowflake;
	messageReportsChannelId: Snowflake;
	userReportsChannelId: Snowflake;
	roleRequestsChannelId: Snowflake;
	modAlertsChannelId: Snowflake;
	messageLogsChannelId: Snowflake;
	voiceLogsChannelId: Snowflake;
	infractionLogsChannelId: Snowflake;
	mediaLogsChannelId: Snowflake;
	memberLogsChannelId: Snowflake;
	reportLogsChannelId: Snowflake;
	commandLogsChannelId: Snowflake;
	lockdownChat1Id: Snowflake;
	lockdownChat2Id: Snowflake;
	autoReactChannelId: Snowflake;
	stageChannelId: Snowflake;
	moderationCategoryId: Snowflake;
	loggingCategoryId: Snowflake;
}
