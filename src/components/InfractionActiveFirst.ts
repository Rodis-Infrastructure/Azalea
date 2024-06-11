import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { handleInfractionActivePagination } from "./InfractionActiveNext";

import Component from "@managers/components/Component";

export default class InfractionActiveFirst extends Component {
    constructor() {
        super("infraction-active-first");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleInfractionActivePagination(interaction, { page: 1 });
    }
}