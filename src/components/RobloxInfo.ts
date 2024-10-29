import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	Colors,
	EmbedBuilder,
	GuildMember,
	time,
	TimestampStyles,
	Snowflake
} from "discord.js";

import { InteractionReplyData, Result } from "@utils/types";

import Component from "@managers/components/Component";


export default class RobloxInfo extends Component {
	constructor() {
		super({ startsWith: "roblox-info" });
	}

	private static async _getLinkedDiscordUser(guildId: Snowflake, robloxId: string, apiKey: string): Promise<Result<RoverDiscordResponse>> {
		const roverDiscordEndpoint = `https://registry.rover.link/api/guilds/${guildId}/roblox-to-discord/${robloxId}`;
		const response = await fetch(roverDiscordEndpoint, {
			method: "GET",
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `Bearer ${apiKey}`
			}
		});

		if (!response.ok) {
			return {
				success: false,
				message: `An error occurred while fetching the user's Discord account: \`${response.status} ${response.statusText}\``
			};
		}

		return {
			success: true,
			data: await response.json() as RoverDiscordResponse
		};
	}

	private static async _getRobloxUser(robloxId: string): Promise<Result<RobloxUser>> {
		const robloxUserEndpoint = `https://users.roblox.com/v1/users/${robloxId}`;
		const response = await fetch(robloxUserEndpoint, {
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
				content: "No RoVer API key found",
				temporary: true,
				ephemeral: true
			};
		}

		const robloxId = interaction.customId.split("-")[2];
		const robloxUserResponse = await RobloxInfo._getRobloxUser(robloxId);

		if (!robloxUserResponse.success) {
			return {
				content: robloxUserResponse.message,
				temporary: true,
				ephemeral: true
			};
		}

		const robloxUser = robloxUserResponse.data;
		const discordUserResponse = await RobloxInfo._getLinkedDiscordUser(interaction.guildId, robloxId, apiKey);

		if (!discordUserResponse.success) {
			return {
				content: discordUserResponse.message,
				temporary: true,
				ephemeral: true
			};
		}

		const discordUsers = discordUserResponse.data.discordUsers;
		const mappedDiscordUsers = discordUsers.map(member => {
			return `<@${member.user.id}> (\`${member.user.id}\`)`;
		}).join("\n");

		const robloxUserCreatedAt = new Date(robloxUser.created);
		const robloxUserCreatedAtTimestamp = time(robloxUserCreatedAt, TimestampStyles.ShortDateTime);

		const embed = new EmbedBuilder()
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
			embeds: [embed],
			components: [buttonRow],
			ephemeral: true
		};
	}
}

interface RoverDiscordResponse {
	discordUsers: GuildMember[];
}

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