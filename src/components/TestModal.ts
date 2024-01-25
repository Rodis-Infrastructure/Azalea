import { Colors, EmbedBuilder, ModalSubmitInteraction } from "discord.js";
import { InteractionReplyData } from "../utils/types.ts";

import Component from "../handlers/components/Component.ts";

export default class TestModal extends Component {
    constructor() {
        super("test-modal");
    }

    execute(interaction: ModalSubmitInteraction<"cached">): InteractionReplyData {
        // Get value from input field
        const phrase = interaction.components[0].components[0].value;

        const embed = new EmbedBuilder()
            .setColor(Colors.Blurple)
            .setDescription(phrase)
            .setAuthor({
                name: `Phrase from ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            });

        return { embeds: [embed] };
    }
}