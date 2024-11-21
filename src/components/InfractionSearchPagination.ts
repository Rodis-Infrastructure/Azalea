import { InteractionReplyData } from "@utils/types";
import { ButtonComponent, ButtonInteraction, InteractionUpdateOptions } from "discord.js";
import { client } from "./..";
import { Permission } from "@managers/config/schema";
import { PageOptions, parsePageOptions } from "./InfractionActivePagination";

import Component from "@managers/components/Component";
import Infraction, { InfractionSearchFilter } from "@/commands/Infraction";
import ConfigManager from "@managers/config/ConfigManager";

export default class InfractionSearchPagination extends Component {
	constructor() {
		super({ matches: /^infraction-search-(next|back|last|first)$/m });
	}

	execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const direction = interaction.customId.split("-")[2] as InfractionSearchPaginationDirection;

		switch (direction) {
			case InfractionSearchPaginationDirection.Next:
				return handleInfractionSearchPagination(interaction, { pageOffset: 1 });

			case InfractionSearchPaginationDirection.Back:
				return handleInfractionSearchPagination(interaction, { pageOffset: -1 });

			case InfractionSearchPaginationDirection.First:
				return handleInfractionSearchPagination(interaction, { page: 1 });

			case InfractionSearchPaginationDirection.Last:
				return handleInfractionSearchPagination(interaction, { page: 0 });

			default:
				return Promise.resolve("Unknown direction.");
		}
	}
}

/**
 * Handles the infraction search pagination
 *
 * @param interaction - The infraction search response
 * @param options - The pagination options
 * @param options.page - The page, values less than 1 will be treated as relative to the last page
 * @param options.pageOffset - The page offset (e.g. `-1` goes back and `1` goes forward)
 */
export async function handleInfractionSearchPagination(interaction: ButtonInteraction<"cached">, options: PageOptions): Promise<InteractionReplyData> {
	const config = ConfigManager.getGuildConfig(interaction.guildId, true);

	if (!config.hasPermission(interaction.member, Permission.ViewInfractions)) {
		return {
			content: "You do not have permission to view infractions.",
			ephemeral: true,
			temporary: true
		};
	}

	const [embed] = interaction.message.embeds;

	// Format: "User ID: {user_id}" or "Archived: {n} | User ID: {user_id}"
	const targetId = embed.footer!.text.split(" ").pop()!;
	const targetMember = await interaction.guild.members.fetch(targetId)
		.catch(() => null);

	const target = targetMember?.user ?? await client.users.fetch(targetId)
		.catch(() => null);

	if (!target) {
		return {
			content: "Failed to fetch the target user.",
			ephemeral: true,
			temporary: true
		};
	}

	// Defer the update to ensure the command doesn't time out
	await interaction.deferUpdate();

	const buttons = interaction.message.components[0].components as ButtonComponent[];
	// Get the middle component
	const pageCountButton = buttons[Math.floor(buttons.length / 2)];
	// Format: "{current_page} / {total_pages}"
	const [strCurrentPage, strTotalPages] = pageCountButton.label!.split(" / ");
	const page = parsePageOptions(options, parseInt(strCurrentPage), parseInt(strTotalPages));
	// Format: "Filter: {filter}"
	const filter = embed.title!.split(" ")[1] as InfractionSearchFilter;

	// We can cast InteractionReplyOptions to InteractionUpdateOptions
	// because they share the same properties
	const updatedResult = await Infraction.search({
		guildId: interaction.guildId,
		member: targetMember,
		user: target,
		page,
		filter
	}) as InteractionUpdateOptions;

	await interaction.editReply(updatedResult);
	return null;
}

export enum InfractionSearchPaginationDirection {
    Next = "next",
    Back = "back",
    Last = "last",
    First = "first"
}