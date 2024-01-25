import { ActionRowBuilder, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import Component from "../handlers/components/Component.ts";
import { InteractionReplyData } from "../utils/types.ts";

export default class TestButton extends Component {
    constructor() {
        super("test-button");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const input = new TextInputBuilder()
            .setCustomId("test-input")
            .setLabel("Phrase")
            .setPlaceholder("Enter phrase...")
            .setRequired(true)
            .setMaxLength(256)
            .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder<TextInputBuilder>()
            .setComponents(input);

        const modal = new ModalBuilder()
            .setCustomId("test-modal")
            .setTitle("Test")
            .setComponents(actionRow);

        await interaction.showModal(modal);

        return null;
    }
}