import { ApplicationCommandOptionType, ChatInputCommandInteraction, Snowflake } from "discord.js";
import { InteractionReplyData, Result } from "@/utils/types";
import ConfigManager from "@/managers/config/ConfigManager";
import Command from "@/managers/commands/Command";
import RobloxInfo from "@/components/RobloxInfo";
import RobloxBan, { Endpoint } from "./RobloxBan";

export default class RobloxUnban extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "roblox-unban",
			description: "Unban a user from the server based on their Roblox account",
			options: [
				{
					name: "roblox-id",
					description: "The Roblox ID to unban",
					type: ApplicationCommandOptionType.String,
					min_length: 1,
					max_length: 20,
					required: true
				}
			]
		});
	}

	/**
     * Deletes a Roblox ban against a user in a guild.
     *
     * @param guildId - ID of the guild to search in
     * @param robloxId - ID of the Roblox user to unban
     * @param apiKey - RoVer API key
     * @returns The result of the ban deletion
     * @private
    */
	private static async _deleteRobloxBan(guildId: Snowflake, robloxId: string, apiKey: string): Promise<Result> {
		const endpoint = Endpoint.RobloxBan
			.replace(":guildId", guildId)
			.replace(":robloxId", robloxId);

		const response = await fetch(endpoint, {
			method: "DELETE",
			headers: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				Authorization: `Bearer ${apiKey}`
			}
		});

		if (!response.ok) {
			return {
				ok: false,
				message: `An error occurred while deleting the Roblox ban: \`${response.status} ${response.statusText}\``
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

		if (!robloxBanResult.ok) {
			return {
				content: `Roblox user with ID \`${robloxIdNumber}\` is not banned`,
				temporary: true
			};
		}

		const deleteBanResult = await RobloxUnban._deleteRobloxBan(interaction.guildId, robloxIdNumber, apiKey);

		if (!deleteBanResult.ok) {
			return {
				content: deleteBanResult.message,
				temporary: true
			};
		}

		const message = `Roblox-unbanned \`${robloxUser.name}\` (\`${robloxIdNumber}\`)`;

		if (interaction.channel && config.channelInScope(interaction.channel)) {
			config.sendNotification(`${interaction.user} ${message}`, false);
		}

		return {
			content: `Successfully ${message}`,
			temporary: true
		};
	}
}