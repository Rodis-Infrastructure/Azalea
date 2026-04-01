import { ActionRowBuilder, APIEmbedField, ApplicationCommandOptionType, ButtonBuilder, ChatInputCommandInteraction, EmbedBuilder, Snowflake } from "discord.js";
import { InteractionReplyData } from "@/utils/types";
import { pluralize, sortSnowflakes, userMentionWithId } from "@/utils";
import { client } from "..";
import { DEFAULT_EMBED_COLOR } from "@/utils/constants";
import ConfigManager from "@/managers/config/ConfigManager";
import Command from "@/managers/commands/Command";
import RobloxBan from "./RobloxBan";
import Infraction from "./Infraction";

export default class RobloxBanView extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "roblox-ban-view",
			description: "View details about a Roblox-ban for a user in the server",
			options: [
				{
					name: "roblox-id",
					description: "The Roblox ID to search for",
					type: ApplicationCommandOptionType.String,
					min_length: 1,
					max_length: 20,
					required: true
				}
			]
		});
	}

	/**
     * Lists the Roblox bans for a user in a guild.
     *
     * @param guildId - ID of the guild to search in
     * @param robloxId - ID of the Roblox user to search for
     * @param apiKey - RoVer API key
     * @param page - The page of results to return (default: 1)
     * @returns An embed containing the list of Discord accounts banned for the specified Roblox user,
     * or an error message if the ban could not be fetched
     */
	static async listBans(guildId: Snowflake, robloxId: string, apiKey: string, page = 1): Promise<InteractionReplyData> {
		const RESULTS_PER_PAGE = 5;
		const skipMultiplier = page - 1;

		const robloxBanResult = await RobloxBan.getRobloxBan(guildId, robloxId, apiKey);

		if (!robloxBanResult.ok) {
			return {
				content: `No matching Roblox-ban found against Roblox user with ID \`${robloxId}\``,
				temporary: true
			};
		}

		const discordIds = robloxBanResult.data.discordIds.slice(
			skipMultiplier * RESULTS_PER_PAGE,
			skipMultiplier * RESULTS_PER_PAGE + RESULTS_PER_PAGE
		);

		const discordIdCount = discordIds.length - 1;

		const paginationComponents: ActionRowBuilder<ButtonBuilder>[] = [];

		// Add pagination if there are more results than can be displayed
		if (discordIdCount > RESULTS_PER_PAGE) {
			const totalPageCount = Math.ceil(discordIdCount / RESULTS_PER_PAGE);
			const paginationActionRow = Infraction.getPaginationActionRow({
				page,
				totalPageCount,
				paginationButtonCustomIdPrefix: "roblox-ban-view"
			});

			paginationComponents.push(paginationActionRow);
		}

		const fields = await RobloxBanView._formatRobloxBanListFields(discordIds);
		const embed = new EmbedBuilder()
			.setColor(DEFAULT_EMBED_COLOR)
			.setTitle(`${discordIdCount} Linked Discord Account ${pluralize(discordIdCount, "Ban")}`)
			.setFields(fields)
			.setFooter({ text: `Roblox ID: ${robloxId}` })
			.setTimestamp();

		return {
			embeds: [embed],
			components: paginationComponents
		};
	}

	private static async _formatRobloxBanListFields(discordIds: string[]): Promise<APIEmbedField[]> {
		const sortedDiscordIds = sortSnowflakes(discordIds);

		return Promise.all(sortedDiscordIds.map(async discordId => {
			const username = await client.users.fetch(discordId)
				.then(user => user.username)
				.catch(() => "Unknown User");
			return {
				name: username,
				value: userMentionWithId(discordId)
			};
		}));
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

		if (!interaction.channel) {
			return {
				content: "Failed to fetch the current channel.",
				temporary: true
			};
		}

		const ephemeral = config.channelInScope(interaction.channel);
		await interaction.deferReply({ ephemeral });
		return RobloxBanView.listBans(interaction.guildId, robloxIdNumber, apiKey);
	}
}