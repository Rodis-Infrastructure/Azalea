import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	Colors,
	EmbedBuilder,
	GuildMember,
	inlineCode,
	InteractionReplyOptions,
	Snowflake,
	time,
	TimestampStyles,
	User
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { BLANK_EMBED_FIELD, DEFAULT_EMBED_COLOR, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { prisma } from "./..";
import { Permission, UserFlag } from "@managers/config/schema";
import { InfractionAction, InfractionUtil } from "@utils/infractions";
import { getSurfaceName } from "@/utils";
import { Messages } from "@utils/messages";

import Command from "@managers/commands/Command";
import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import RobloxInfo from "@/components/RobloxInfo";

export default class UserInfo extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "user",
			description: "Get information about a user",
			options: [{
				name: "info",
				description: "Get information about a user",
				type: ApplicationCommandOptionType.Subcommand,
				options: [{
					name: "user",
					type: ApplicationCommandOptionType.User,
					description: "The user to get information about",
					required: true
				}]
			}]
		});
	}

	/**
	 * Get information about a user
	 *
	 * @param data.member - The target member (for role checks)
	 * @param data.user - The target user
	 * @param data.config - The guild configuration
	 * @param data.channel - The channel the command was executed in
	 * @param data.executor - The executor of the command
	 * @returns An interaction reply with the user's information
	 */
	static async get(data: {
		member: GuildMember | null;
		user: User;
		config: GuildConfig;
		executor: GuildMember;
	}): Promise<InteractionReplyOptions> {
		const { member, user, config, executor } = data;
		const surfaceName = getSurfaceName(member ?? user);

		const embed = new EmbedBuilder()
			.setColor(DEFAULT_EMBED_COLOR)
			.setAuthor({
				name: surfaceName,
				iconURL: user.displayAvatarURL(),
				url: user.displayAvatarURL()
			})
			.setFields({
				name: "Account Created",
				value: time(user.createdAt, TimestampStyles.RelativeTime),
				inline: true
			})
			.setFooter({ text: `User ID: ${user.id}` });

		if (member?.joinedAt) {
			embed.addFields({
				name: "Joined",
				value: time(member.joinedAt, TimestampStyles.RelativeTime),
				inline: true
			});
		}

		const [isBanned, banReason] = await config.guild.bans
			.fetch(user.id)
			.then(ban => [true, ban.reason] as const)
			.catch(() => [false, null] as const);

		// Fetch the infraction from the database
		// in order to get the most up-to-date reason
		// @formatter:off
		const ban = !isBanned
			? null
			: await prisma.infraction.findFirst({
				select: { reason: true, id: true },
				where: {
					action: InfractionAction.Ban,
					target_id: user.id,
					guild_id: config.guild.id
				},
				orderBy: { created_at: "desc" }
			}) ?? {
				reason: banReason ?? DEFAULT_INFRACTION_REASON,
				id: -1
			};
		// @formatter:on

		if (ban && ban.id !== -1) {
			const reasonPreview = InfractionUtil.formatReasonPreview(ban.reason ?? DEFAULT_INFRACTION_REASON);

			embed.setColor(Colors.Red);
			embed.setTitle("Banned");
			embed.setDescription(reasonPreview);
		} else if (!member) {
			embed.setColor(Colors.Red);
			embed.setTitle("Not in server");
		}

		const flags = UserInfo._getFlags(member, user, config);

		if (flags.length) {
			const formattedFlags = flags
				.map(inlineCode)
				.join("\n");

			embed.addFields({
				name: "Flags",
				value: formattedFlags,
				inline: true
			});
		}

		// Add empty fields to complete row (for a better layout)
		const blankFields = Array(3 - embed.data.fields!.length)
			.fill(BLANK_EMBED_FIELD);

		embed.addFields(blankFields);

		// Add message count
		const messageCount = await Messages.count(user.id, config.guild.id);
		const msMessageLifetime = ConfigManager.globalConfig.database.messages.ttl;

		const dateTo = Math.floor(new Date().getTime() / 1000);
		const dateFrom = Math.floor(dateTo - (msMessageLifetime / 1000));

		const dateFromTimestamp = time(dateFrom, TimestampStyles.ShortDate);
		const dateToTimestamp = time(dateTo, TimestampStyles.ShortDate);

		embed.addFields({
			name: `Messages Sent (${dateFromTimestamp} → ${dateToTimestamp})`,
			value: `Total: \`${messageCount.total}\`\nDeleted: \`${messageCount.deleted}\``
		});

		const buttonRow = new ActionRowBuilder<ButtonBuilder>();

		// Append a 'Roblox Info' button if a RoVer API key is set
		// and the target user is linked to a Roblox account
		if (process.env.ROVER_API_KEY) {
			const result = await RobloxInfo.getLinkedRobloxUser(config.guild.id, user.id, process.env.ROVER_API_KEY);

			if (result.ok) {
				const robloxInfoButton = new ButtonBuilder()
					.setStyle(ButtonStyle.Danger)
					.setLabel("Roblox Info")
					.setCustomId(`roblox-info-${result.data.robloxId}`);

				buttonRow.addComponents(robloxInfoButton);
			}
		}

		// Executor has permission to view infractions and the target does not have permission to view infractions
		if (config.hasPermission(executor, Permission.ViewInfractions) && (!member || !config.hasPermission(member, Permission.ViewInfractions))) {
			const hasInfractions = await UserInfo._getReceivedInfractions(embed, user.id, config.guild.id);

			if (ban) {
				const banInfoButton = new ButtonBuilder()
					.setLabel("Ban Info")
					.setStyle(ButtonStyle.Danger)
					.setCustomId(`infraction-info-${ban.id}`);

				buttonRow.addComponents(banInfoButton);
			}

			if (hasInfractions) {
				const infractionSearchButton = new ButtonBuilder()
					.setLabel("Infractions")
					.setCustomId(`infraction-search-${user.id}`)
					.setStyle(ButtonStyle.Secondary);

				buttonRow.addComponents(infractionSearchButton);
			}
		}

		if (buttonRow.components.length) {
			return { embeds: [embed], components: [buttonRow] };
		} else {
			return { embeds: [embed] };
		}
	}

	/**
	 * Appends an infraction count field to the passed embed
	 *
	 * @param embed - The embed to append the field to
	 * @param userId - ID of the user to count infractions for
	 * @param guildId - The source guild's ID
	 * @returns Whether the user has any infractions
	 * @private
	 */
	private static async _getReceivedInfractions(embed: EmbedBuilder, userId: Snowflake, guildId: Snowflake): Promise<boolean> {
		const [infractions] = await prisma.$queryRaw<InfractionCount[]>`
            SELECT SUM(action = ${InfractionAction.Ban})  as ban_count,
                   SUM(action = ${InfractionAction.Kick}) as kick_count,
                   SUM(action = ${InfractionAction.Mute}) as mute_count,
                   SUM(action = ${InfractionAction.Warn}) as warn_count,
                   SUM(action = ${InfractionAction.Note}) as note_count
            FROM Infraction
            WHERE target_id = ${userId}
              AND guild_id = ${guildId}
              AND archived_at IS NULL
              AND archived_by IS NULL;
		`;

		const infractionList: [string, bigint | null][] = [
			["Bans", infractions.ban_count],
			["Kicks", infractions.kick_count],
			["Mutes", infractions.mute_count],
			["Warns", infractions.warn_count],
			["Notes", infractions.note_count]
		];

		const formattedInfractionList = UserInfo._formatInfractionList(infractionList);

		embed.addFields({
			name: "Infractions Received",
			inline: embed.data.fields!.length >= 3,
			value: formattedInfractionList
		});

		return formattedInfractionList !== "None";
	}

	/**
	 * Formats a list of infractions
	 *
	 * @param list - The list of infractions to format. [name, count]
	 * @returns The formatted list
	 * @private
	 */
	private static _formatInfractionList(list: [string, bigint | null][]): string {
		return list
			.filter(([, count]) => Boolean(count))
			.map(([name, count]) => `${name}: \`${count}\``)
			.join("\n") || "None";
	}

	/**
	 * Get all flags for a user
	 *
	 * @param member - The member instance (for role checks)
	 * @param user - The user instance (for default flags)
	 * @param config - The guild configuration
	 * @returns An array of flags
	 * @private
	 */
	private static _getFlags(member: GuildMember | null, user: User, config: GuildConfig): string[] {
		const flags: string[] = [];

		if (member) {
			if (member.isCommunicationDisabled()) {
				flags.push("Muted");
			}

			const hasFlag = (flag: UserFlag): boolean => {
				return flag.roles.some(role => member.roles.cache.has(role));
			};

			// Check if the user has any custom flags, return all applicable ones
			config.data.user_flags
				.filter(hasFlag)
				.forEach(flag => flags.push(flag.label));
		}

		if (user.bot) {
			flags.push("Bot");
		}

		return flags;
	}

	execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const member = interaction.options.getMember("user");
		const user = member?.user ?? interaction.options.getUser("user", true);
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		return UserInfo.get({
			executor: interaction.member,
			config,
			member,
			user
		});
	}
}


export interface InfractionCount {
	ban_count: bigint | null;
	kick_count: bigint | null;
	mute_count: bigint | null;
	warn_count: bigint | null;
	note_count: bigint | null;
}
