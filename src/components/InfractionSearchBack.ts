import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { handleInfractionSearchPagination } from "./InfractionSearchNext";

import Component from "@managers/components/Component";

export default class InfractionSearchBack extends Component {
    constructor() {
        super("infraction-search-back");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionSearchPagination(interaction, { pageOffset: -1 });
    }
}