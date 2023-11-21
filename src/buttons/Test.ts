import { ActionRowBuilder, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Button } from "../handlers/buttons/Button.ts";

export default class Test extends Button {
    constructor() {
        super("test-button");
    }

    async handle(interaction: ButtonInteraction): Promise<void> {
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
    }
}