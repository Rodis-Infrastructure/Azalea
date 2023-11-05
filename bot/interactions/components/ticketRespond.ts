import { ActionRowBuilder, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { InteractionResponseType } from "@bot/types/interactions";
import { Component } from "@bot/handlers/interactions/interaction";

export default class TicketRespondButton extends Component<ButtonInteraction<"cached">> {
    constructor() {
        super({
            // Format: ticket-respond-<userId>
            name: { startsWith: "ticket-respond" },
            defer: InteractionResponseType.Default,
            skipInternalUsageCheck: false
        });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<void> {
        const targetId = interaction.customId.split("-")[2];

        const messageInput = new TextInputBuilder()
            .setCustomId("message")
            .setRequired(true)
            .setLabel("Message")
            .setPlaceholder("Enter message...")
            .setMaxLength(1024)
            .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder<TextInputBuilder>()
            .setComponents(messageInput);

        const modal = new ModalBuilder()
            .setCustomId(`contact-${targetId}`)
            .setTitle("Respond")
            .setComponents(actionRow);

        await interaction.showModal(modal);
    }
}