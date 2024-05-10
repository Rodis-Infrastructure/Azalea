import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { client } from "./..";

import Component from "@managers/components/Component";
import Infraction, { InfractionSearchFilter } from "@/commands/Infraction";

export default class Infractions extends Component {
    constructor() {
        // Format: infraction-search-{userId}
        super({ matches: /infraction-search-\d{17,19}/g });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const userId = interaction.customId.split("-")[2];
        const user = await client.users.fetch(userId).catch(() => null);

        if (!user) {
            return "Failed to fetch the target user.";
        }

        return Infraction.search({
            filter: InfractionSearchFilter.All,
            guildId: interaction.guildId,
            page: 1,
            user
        });
    }
}