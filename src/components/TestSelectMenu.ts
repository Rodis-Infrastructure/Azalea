import { StringSelectMenuInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import Component from "@managers/components/Component";

export default class TestSelectMenu extends Component {
    constructor() {
        super("test-select-menu");
    }

    execute(interaction: StringSelectMenuInteraction<"cached">): InteractionReplyData {
        return interaction.values[0];
    }
}