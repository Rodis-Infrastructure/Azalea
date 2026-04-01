import { InteractionReplyData } from "@utils/types";
import { ButtonComponent, ButtonInteraction, InteractionUpdateOptions } from "discord.js";
import { InfractionSearchPaginationDirection } from "./InfractionSearchPagination";
import { Permission } from "@managers/config/schema";
import { PageOptions, parsePageOptions } from "./InfractionActivePagination";

import Component from "@managers/components/Component";
import RobloxBanView from "@/commands/RobloxBanView";
import ConfigManager from "@managers/config/ConfigManager";

export default class RobloxBanViewPagination extends Component {
	constructor() {
		super({ matches: /^roblox-ban-view-(next|back|last|first)$/m });
	}

	execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const direction = interaction.customId.split("-")[2] as InfractionSearchPaginationDirection;

		switch (direction) {
			case InfractionSearchPaginationDirection.Next:
				return handleRobloxBanViewPagination(interaction, { pageOffset: 1 });

			case InfractionSearchPaginationDirection.Back:
				return handleRobloxBanViewPagination(interaction, { pageOffset: -1 });

			case InfractionSearchPaginationDirection.First:
				return handleRobloxBanViewPagination(interaction, { page: 1 });

			case InfractionSearchPaginationDirection.Last:
				return handleRobloxBanViewPagination(interaction, { page: 0 });

			default:
				return Promise.resolve("Unknown direction.");
		}
	}
}

/**
 * Handles the roblox ban list pagination
 *
 * @param interaction - The roblox ban list response
 * @param options - The pagination options
 * @param options.page - The page, values less than 1 will be treated as relative to the last page
 * @param options.pageOffset - The page offset (e.g. `-1` goes back and `1` goes forward)
 */
export async function handleRobloxBanViewPagination(interaction: ButtonInteraction<"cached">, options: PageOptions): Promise<InteractionReplyData> {
	const apiKey = process.env.ROVER_API_KEY;

	if (!apiKey) {
		return {
			content: "Missing RoVer API key, it must be set in the `ROVER_API_KEY` environment variable.",
			temporary: true,
			ephemeral: true
		};
	}

	const config = ConfigManager.getGuildConfig(interaction.guildId, true);

	if (!config.hasPermission(interaction.member, Permission.ViewRobloxBans)) {
		return {
			content: "You do not have permission to view Roblox bans.",
			ephemeral: true,
			temporary: true
		};
	}

	// Format: "Roblox ID: {roblox_id}"
	const robloxId = interaction.message.embeds[0].footer!.text.split(" ").pop()!;
	const guildId = interaction.guildId;

	const buttons = interaction.message.components[0].components as ButtonComponent[];
	// Get the middle component
	const pageCountButton = buttons[Math.floor(buttons.length / 2)];
	// Format: "{current_page} / {total_pages}"
	const [strCurrentPage, strTotalPages] = pageCountButton.label!.split(" / ");
	const page = parsePageOptions(options, parseInt(strCurrentPage), parseInt(strTotalPages));

	// We can cast InteractionReplyOptions to InteractionUpdateOptions
	// because they share the same properties
	const updatedResult = await RobloxBanView.listBans(guildId, robloxId, apiKey, page) as InteractionUpdateOptions;
	await interaction.update(updatedResult);

	return null;
}