import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	Colors,
	EmbedBuilder,
	GuildMember,
	Snowflake,
	time,
	TimestampStyles
} from "discord.js";

import { InteractionReplyData, Result } from "@utils/types";

import Component from "@managers/components/Component";


export default class RobloxInfo extends Component {
	constructor() {
		// Format: `roblox-info-<robloxId>`
		super({ startsWith: "roblox-info" });
	}

	/**
	 * Fetches a list of Discord users linked to a Roblox account
	 *
	 * @param guildId - ID of the guild to search in
	 * @param discordId - ID of the Discord user
	 * @param apiKey - RoVer API key
	 * @returns The Roblox user linked to the Discord account
	 * @private
	 */
	static async getLinkedRobloxUser(guildId: Snowflake, discordId: Snowflake, apiKey: string): Promise<Result<RoverRobloxResponse>> {
		const endpoint = Endpoint.DiscordToRoblox
			.replace(":guildId", guildId)
			.replace(":discordId", discordId);

		const response = await fetch(endpoint, {
			method: "GET",
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `Bearer ${apiKey}`
			}
		});

		if (!response.ok) {
			return {
				success: false,
				message: `An error occurred while fetching the user's Roblox account: \`${response.status} ${response.statusText}\``
			};
		}

		return {
			success: true,
			data: await response.json() as RoverRobloxResponse
		};
	}

	/**
	 * Fetches a list of Discord users linked to a Roblox account
	 *
	 * @param guildId - ID of the guild to search in
	 * @param robloxId - ID of the Roblox user
	 * @param apiKey - RoVer API key
	 * @returns A list of Discord users linked to the Roblox account
	 * @private
	 */
	private static async _getLinkedDiscordUsers(guildId: Snowflake, robloxId: string, apiKey: string): Promise<Result<RoverDiscordResponse>> {
		const endpoint = Endpoint.RobloxToDiscord
			.replace(":guildId", guildId)
			.replace(":robloxId", robloxId);

		const response = await fetch(endpoint, {
			method: "GET",
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `Bearer ${apiKey}`
			}
		});

		if (!response.ok) {
			return {
				success: false,
				message: `An error occurred while fetching the user's Discord accounts: \`${response.status} ${response.statusText}\``
			};
		}

		return {
			success: true,
			data: await response.json() as RoverDiscordResponse
		};
	}

	/**
	 * Fetches a Roblox user by their ID
	 *
	 * @param robloxId - ID of the Roblox user
	 * @returns The Roblox user
	 * @private
	 */
	private static async _getRobloxUser(robloxId: string): Promise<Result<RobloxUser>> {
		const endpoint = Endpoint.RobloxUser
			.replace(":robloxId", robloxId);

		const response = await fetch(endpoint, {
			method: "GET",
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				"Content-Type": "application/json"
			}
		});

		if (!response.ok) {
			return {
				success: false,
				message: `An error occurred while fetching the user's Roblox account: \`${response.status} ${response.statusText}\``
			};
		}

		return {
			success: true,
			data: await response.json() as RobloxUser
		};
	}

	async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const apiKey = process.env.ROVER_API_KEY;

		if (!apiKey) {
			return {
				content: "Missing RoVer API key, it must be set in the `ROVER_API_KEY` environment variable.",
				temporary: true,
				ephemeral: true
			};
		}

		const robloxId = interaction.customId.split("-")[2];
		const robloxUserResult = await RobloxInfo._getRobloxUser(robloxId);

		if (!robloxUserResult.success) {
			return {
				content: robloxUserResult.message,
				temporary: true,
				ephemeral: true
			};
		}

		const robloxUser = robloxUserResult.data;
		const discordUserResult = await RobloxInfo._getLinkedDiscordUsers(interaction.guildId, robloxId, apiKey);

		if (!discordUserResult.success) {
			return {
				content: discordUserResult.message,
				temporary: true,
				ephemeral: true
			};
		}

		const discordUsers = discordUserResult.data.discordUsers;
		const mappedDiscordUsers = discordUsers.map(member => {
			return `<@${member.user.id}> (\`${member.user.id}\`)`;
		}).join("\n");

		const robloxUserCreatedAt = new Date(robloxUser.created);
		const robloxUserCreatedAtTimestamp = time(robloxUserCreatedAt, TimestampStyles.ShortDateTime);

		const robloxInfoEmbed = new EmbedBuilder()
			.setColor(Colors.Red)
			.setTitle(robloxUser.name)
			.setThumbnail(`https://roblox-avatar.eryn.io/${robloxUser.id}`)
			.setDescription(robloxUser.description)
			.setFields([
				{
					name: "Roblox Display Name",
					value: robloxUser.displayName,
					inline: true
				},
				{
					name: "Created",
					value: robloxUserCreatedAtTimestamp,
					inline: true
				},
				{
					name: "Is Banned?",
					value: robloxUser.isBanned ? "Yes" : "No",
					inline: true
				},
				{
					name: "Verified Discord Accounts",
					value: mappedDiscordUsers
				}
			])
			.setFooter({ text: `Roblox ID: ${robloxUser.id}` });

		const openRobloxProfileButton = new ButtonBuilder()
			.setLabel("Open Roblox Profile")
			.setStyle(ButtonStyle.Link)
			.setURL(`https://roblox.com/users/${robloxUser.id}/profile`);

		const buttonRow = new ActionRowBuilder<ButtonBuilder>()
			.setComponents(openRobloxProfileButton);

		return {
			embeds: [robloxInfoEmbed],
			components: [buttonRow],
			ephemeral: true
		};
	}
}

/** Response format of {@link Endpoint.RobloxToDiscord} */
interface RoverDiscordResponse {
	discordUsers: GuildMember[];
}

/** Response format of {@link Endpoint.DiscordToRoblox} */
interface RoverRobloxResponse {
	robloxId: number;
	cachedUsername: string;
	discordId: string;
	guildId: string;
}

/** Response format of {@link Endpoint.RobloxUser} */
interface RobloxUser {
	id: number;
	name: string;
	displayName: string;
	hasVerifiedBadge: boolean;
	externalAppDisplayName: string;
	isBanned: boolean;
	created: string;
	description: string;
}

enum Endpoint {
	/**
	 * Returns a list of Discord users linked to a Roblox account.
	 * See {@link RoverDiscordResponse} for the response format
	 *
	 * ## Args
	 * - `:guildId` - ID of the guild to search in
	 * - `:robloxId` - ID of the Roblox user
	 */
	RobloxToDiscord = "https://registry.rover.link/api/guilds/:guildId/roblox-to-discord/:robloxId",
	/**
	 * Returns the Roblox user linked to a Discord account.
	 * See {@link RoverRobloxResponse} for the response format
	 *
	 * ## Args
	 * - `:guildId` - ID of the guild to search in
	 * - `:discordId` - ID of the Discord user
	 */
	DiscordToRoblox = "https://registry.rover.link/api/guilds/:guildId/discord-to-roblox/:discordId",
	/**
	 * Returns the Roblox user by their ID.
	 * See {@link RobloxUser} for the response format
	 *
	 * ## Args
	 * - `:robloxId` - ID of the Roblox user
	 */
	RobloxUser = "https://users.roblox.com/v1/users/:robloxId"
}