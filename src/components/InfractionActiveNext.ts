import { InteractionReplyData } from "@utils/types";
import { ButtonComponent, ButtonInteraction, InteractionUpdateOptions } from "discord.js";

import Component from "@managers/components/Component";
import Infraction from "@/commands/Infraction";

export default class InfractionActiveNext extends Component {
    constructor() {
        super("infraction-active-next");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionActivePagination(interaction, 1);
    }
}

/**
 * Handles the infraction active pagination
 *
 * @param interaction - The infraction active response
 * @param pageOffset - The page offset (e.g. `-1` goes back and `1` goes forward)
 */
export async function handleInfractionActivePagination(interaction: ButtonInteraction<"cached">, pageOffset: number): Promise<InteractionReplyData> {
    const pageCountButton = interaction.message.components[0].components[1] as ButtonComponent;

    // Format: "{current_page} / {total_pages}"
    const currentPage = parseInt(pageCountButton.label!.split(" / ")[0]);

    // We can cast InteractionReplyOptions to InteractionUpdateOptions
    // because they share the same properties
    const updatedResult = await Infraction.listActive(currentPage + pageOffset) as InteractionUpdateOptions;
    await interaction.update(updatedResult);

    return null;
}