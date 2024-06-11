import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { handleInfractionSearchPagination } from "./InfractionSearchNext";

import Component from "@managers/components/Component";

export default class InfractionSearchFirst extends Component {
    constructor() {
        super("infraction-search-first");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionSearchPagination(interaction, { page: 1 });
    }
}