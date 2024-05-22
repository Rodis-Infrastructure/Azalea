import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { handleInfractionActivePagination } from "./InfractionActiveNext";

import Component from "@managers/components/Component";

export default class InfractionActiveBack extends Component {
    constructor() {
        super("infraction-active-back");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionActivePagination(interaction, -1);
    }
}