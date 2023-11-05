import { ActionRowBuilder, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { InteractionResponseType } from "@bot/types/interactions";
import { Component } from "@bot/handlers/interactions/interaction";

export default class TicketEditPromptButton extends Component<ButtonInteraction<"cached">> {
    constructor() {
        super({
            // Format: ticket-prompt-edit-<userId>-<messageId>
            name: { startsWith: "ticket-prompt-edit" },
            defer: InteractionResponseType.Default,
            skipInternalUsageCheck: false
        });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<void> {
        const targetId = interaction.customId.split("-")[3];
        const messageId = interaction.customId.split("-")[4];
        const [logEmbed] = interaction.message.embeds;

        // Format: ID: <userId>
        const initiatorId = logEmbed.footer?.text.split(" ")[1];
        // The "Message" field
        const initialMessage = logEmbed.fields[1].value;

        if (interaction.user.id !== initiatorId) {
            await interaction.reply({
                content: "You must be the initiator of this message to edit it.",
                ephemeral: true
            });
            return;
        }

        const messageInput = new TextInputBuilder()
            .setCustomId("message")
            .setRequired(true)
            .setLabel("Message")
            .setPlaceholder("Enter message...")
            .setValue(initialMessage)
            .setMaxLength(1024)
            .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder<TextInputBuilder>()
            .setComponents(messageInput);

        const modal = new ModalBuilder()
            .setCustomId(`ticket-edit-${targetId}-${messageId}`)
            .setTitle("Edit Message")
            .setComponents(actionRow);

        await interaction.showModal(modal);
    }
}