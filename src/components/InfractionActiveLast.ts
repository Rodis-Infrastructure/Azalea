import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { handleInfractionActivePagination } from "./InfractionActiveNext";

import Component from "@managers/components/Component";

export default class InfractionActiveLast extends Component {
    constructor() {
        super("infraction-active-last");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionActivePagination(interaction, { page: 0 });
    }
}