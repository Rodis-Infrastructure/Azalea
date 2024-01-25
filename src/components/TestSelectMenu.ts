import { StringSelectMenuInteraction } from "discord.js";
import { InteractionReplyData } from "../utils/types.ts";

import Component from "../handlers/components/Component.ts";

export default class TestSelectMenu extends Component {
    constructor() {
        super("test-select-menu");
    }

    execute(interaction: StringSelectMenuInteraction<"cached">): InteractionReplyData {
        return interaction.values[0];
    }
}