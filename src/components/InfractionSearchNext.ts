import { InteractionReplyData } from "@utils/types";
import { ButtonComponent, ButtonInteraction, InteractionUpdateOptions } from "discord.js";
import { client } from "./..";

import Component from "@managers/components/Component";
import Infraction, { InfractionSearchFilter } from "@/commands/Infraction";

export default class InfractionSearchNext extends Component {
    constructor() {
        super("infraction-search-next");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionSearchPagination(interaction, 1);
    }
}

/**
 * Handles the infraction search pagination
 *
 * @param interaction - The infraction search response
 * @param pageOffset - The page offset (e.g. `-1` goes back and `1` goes forward)
 */
export async function handleInfractionSearchPagination(interaction: ButtonInteraction<"cached">, pageOffset: number): Promise<InteractionReplyData> {
    const embed = interaction.message.embeds[0];

    // Format: "User ID: {user_id}"
    const targetId = embed.footer!.text.split(": ")[1];
    const target = await client.users.fetch(targetId).catch(() => null);

    if (!target) {
        return {
            content: "Failed to fetch the target user.",
            ephemeral: true
        };
    }

    const pageCountButton = interaction.message.components[0].components[1] as ButtonComponent;
    // Format: "{current_page} / {total_pages}"
    const currentPage = parseInt(pageCountButton.label!.split(" / ")[0]);
    // Format: "Filter: {filter}"
    const filter = embed.title!.split(" ")[1] as InfractionSearchFilter;

    // We can cast InteractionReplyOptions to InteractionUpdateOptions
    // because they share the same properties
    const updatedResult = await Infraction.search({
        guildId: interaction.guildId,
        page: currentPage + pageOffset,
        user: target,
        filter
    }) as InteractionUpdateOptions;

    await interaction.update(updatedResult);
    return null;
}