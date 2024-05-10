import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import Infraction, { InfractionSearchFilter } from "./Infraction";
import Command from "@managers/commands/Command";

export default class SearchInfractionsCtx extends Command<UserContextMenuCommandInteraction> {
    constructor() {
        super({
            name: "Search infractions",
            type: ApplicationCommandType.User
        });
    }

    execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        return Infraction.search({
            user: interaction.targetUser,
            guildId: interaction.guildId,
            filter: InfractionSearchFilter.All,
            page: 1
        });
    }
}