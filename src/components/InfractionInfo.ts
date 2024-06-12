import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";

import Component from "@managers/components/Component";
import Infraction from "@/commands/Infraction";
import ConfigManager from "@managers/config/ConfigManager";
import { Permission } from "@managers/config/schema";

export default class InfractionInfo extends Component {
    constructor() {
        super({ matches: /^infraction-info-\d+$/g });
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (!config.hasPermission(interaction.member, Permission.ViewInfractions)) {
            return Promise.resolve({
                content: "You do not have permission to view infractions",
                ephemeral: true,
                temporary: true
            });
        }

        const infractionId = parseInt(interaction.customId.split("-")[2]);
        return Infraction.info(infractionId, interaction.guildId);
    }
}