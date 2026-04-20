import { ApplicationCommandOptionType, ChatInputCommandInteraction, Snowflake } from "discord.js";
import { InteractionReplyData, Result } from "@/utils/types";
import ConfigManager from "@/managers/config/ConfigManager";
import Command from "@/managers/commands/Command";
import RobloxInfo from "@/components/RobloxInfo";

export default class RobloxBan extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "roblox-ban",
			description: "Ban a user from the server based on their Roblox account",
			options: [
				{
					name: "roblox-id",
					description: "The Roblox ID to ban",
					type: ApplicationCommandOptionType.String,
					min_length: 1,
					max_length: 20,
					required: true
				}
			]
		});
	}

	/**
     * Fetches a Roblox ban for a user in a guild.
     *
     * @param guildId - ID of the guild to search in
     * @param robloxId - ID of the Roblox user
     * @param apiKey - RoVer API key
     * @returns The Roblox ban for the user, if it exists
    */
	static async getRobloxBan(guildId: Snowflake, robloxId: string, apiKey: string): Promise<Result<RoverBanResponse>> {
		const endpoint = Endpoint.RobloxBan
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
				ok: false,
				message: `An error occurred while fetching the Roblox ban: \`${response.status} ${response.statusText}\``
			};
		}

		return {
			ok: true,
			data: await response.json() as RoverBanResponse
		};
	}

	/**
     * Creates a Roblox ban for a user in a guild.
     *
     * @param guildId - ID of the guild to search in
     * @param robloxId - ID of the Roblox user to ban
     * @param apiKey - RoVer API key
     * @returns The result of the ban creation
     * @private
    */
	private static async _createRobloxBan(guildId: Snowflake, robloxId: string, apiKey: string): Promise<Result> {
		const endpoint = Endpoint.RobloxBan
			.replace(":guildId", guildId)
			.replace(":robloxId", robloxId);

		const response = await fetch(endpoint, {
			method: "PUT",
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `Bearer ${apiKey}`
			}
		});

		if (!response.ok) {
			return {
				ok: false,
				message: `An error occurred while creating the Roblox ban: \`${response.status} ${response.statusText}\``
			};
		}

		return { ok: true };
	}

	async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const apiKey = process.env.ROVER_API_KEY;

		if (!apiKey) {
			return {
				content: "Missing RoVer API key, it must be set in the `ROVER_API_KEY` environment variable.",
				temporary: true,
				ephemeral: true
			};
		}

		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const robloxId = interaction.options.getString("roblox-id", true);

		// Extract the digits from the Roblox ID
		const robloxIdNumber = robloxId.match(/\d+/g)?.join("");

		if (!robloxIdNumber) {
			return {
				content: "Invalid Roblox ID provided.",
				temporary: true
			};
		}

		const robloxUserResult = await RobloxInfo.getRobloxUser(robloxIdNumber);

		if (!robloxUserResult.ok) {
			return {
				content: `Failed to fetch Roblox user with ID \`${robloxIdNumber}\``,
				temporary: true
			};
		}

		const robloxUser = robloxUserResult.data;

		const robloxBanResult = await RobloxBan.getRobloxBan(interaction.guildId, robloxIdNumber, apiKey);

		if (robloxBanResult.ok) {
			const reason = robloxBanResult.data.reason ? ` for the following reason: \`${robloxBanResult.data.reason}\`` : "";
			return {
				content: `Roblox user with ID \`${robloxIdNumber}\` is already banned${reason}`,
				temporary: true
			};
		}

		const createBanResult = await RobloxBan._createRobloxBan(interaction.guildId, robloxIdNumber, apiKey);

		if (!createBanResult.ok) {
			return {
				content: createBanResult.message,
				temporary: true
			};
		}

		const message = `Roblox-banned \`${robloxUser.name}\` (\`${robloxIdNumber}\`)`;

		if (interaction.channel && config.channelInScope(interaction.channel)) {
			config.sendNotification(`${interaction.user} ${message}`, false);
		}

		return {
			content: `Successfully ${message}`,
			temporary: true
		};
	}
}

/** Response format of {@link Endpoint.GetRobloxBan} */
export interface RoverBanResponse {
	robloxId: number;
	reason?: string;
	discordIds: string[];
	createdAt: string;
}

export enum Endpoint {
	/**
     * Fetches a Roblox ban for a user in a guild.
     *
     * ## Args
     * - `:guildId` - ID of the guild to search in
     * - `:robloxId` - ID of the Roblox user
     */
	RobloxBan = "https://registry.rover.link/api/guilds/:guildId/bans/:robloxId",
}