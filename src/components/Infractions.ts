import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { client } from "./..";

import Component from "@managers/components/Component";
import Infraction, { InfractionSearchFilter } from "@/commands/Infraction";
import ConfigManager from "@managers/config/ConfigManager";
import { Permission } from "@managers/config/schema";

export default class Infractions extends Component {
    constructor() {
        // Format: infraction-search-{userId}
        super({ matches: /infraction-search-\d{17,19}/g });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (!config.hasPermission(interaction.member, Permission.ViewInfractions)) {
            return {
                content: "You do not have permission to view infractions.",
                ephemeral: true
            };
        }

        const userId = interaction.customId.split("-")[2];
        const user = await client.users.fetch(userId).catch(() => null);

        if (!user) {
            return {
                content: "Failed to fetch the target user.",
                ephemeral: true
            };
        }

        return Infraction.search({
            filter: InfractionSearchFilter.Infractions,
            guildId: interaction.guildId,
            page: 1,
            user
        });
    }
}