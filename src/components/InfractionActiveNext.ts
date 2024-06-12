import { InteractionReplyData } from "@utils/types";
import { ButtonComponent, ButtonInteraction, InteractionUpdateOptions } from "discord.js";
import { Permission } from "@managers/config/schema";

import Component from "@managers/components/Component";
import Infraction from "@/commands/Infraction";
import ConfigManager from "@managers/config/ConfigManager";

export default class InfractionActiveNext extends Component {
    constructor() {
        super("infraction-active-next");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionActivePagination(interaction, { pageOffset: 1 });
    }
}

/**
 * Handles the infraction active pagination
 *
 * @param interaction - The infraction active response
 * @param options - The pagination options
 * @param options.page - The page, values less than 1 will be treated as relative to the last page
 * @param options.pageOffset - The page offset (e.g. `-1` goes back and `1` goes forward)
 */
export async function handleInfractionActivePagination(interaction: ButtonInteraction<"cached">, options: PageOptions): Promise<InteractionReplyData> {
    const config = ConfigManager.getGuildConfig(interaction.guildId, true);

    if (!config.hasPermission(interaction.member, Permission.ViewInfractions)) {
        return {
            content: "You do not have permission to view infractions.",
            ephemeral: true,
            temporary: true
        };
    }

    const buttons = interaction.message.components[0].components as ButtonComponent[];
    // Get the middle component
    const pageCountButton = buttons[Math.floor(buttons.length / 2)];
    // Format: "{current_page} / {total_pages}"
    const [strCurrentPage, strTotalPages] = pageCountButton.label!.split(" / ");
    const page = parsePageOptions(options, parseInt(strCurrentPage), parseInt(strTotalPages));

    // We can cast InteractionReplyOptions to InteractionUpdateOptions
    // because they share the same properties
    const updatedResult = await Infraction.listActive(page) as InteractionUpdateOptions;
    await interaction.update(updatedResult);

    return null;
}

export function parsePageOptions(options: PageOptions, currentPage: number, totalPages: number): number {
    if ("pageOffset" in options) {
        return currentPage + options.pageOffset;
    } else {
        return options.page < 1 ? totalPages + options.page : options.page;
    }
}

export type PageOptions = Record<"pageOffset", number> | Record<"page", number>;