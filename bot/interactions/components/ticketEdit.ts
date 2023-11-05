import { InteractionResponseType } from "@bot/types/interactions";
import { EmbedBuilder, ModalSubmitInteraction } from "discord.js";
import { Component } from "@bot/handlers/interactions/interaction";
import { fetchDM } from "@bot/utils";

import Config from "@bot/utils/config";

export default class TicketEditButton extends Component<ModalSubmitInteraction<"cached">> {
    constructor() {
        super({
            // Format: ticket-edit-<userId>-<messageId>
            name: { startsWith: "ticket-edit" },
            defer: InteractionResponseType.Default,
            skipInternalUsageCheck: false
        });
    }

    async execute(interaction: ModalSubmitInteraction<"cached">, _ephemeral: never, config: Config): Promise<void> {
        const targetId = interaction.customId.split("-")[2];
        const messageId = interaction.customId.split("-")[3];
        const directMessage = await fetchDM(targetId, messageId);

        if (!directMessage) {
            await interaction.reply({
                content: `${config.emojis.error} Failed to fetch the DM.`,
                ephemeral: true
            });
            return;
        }

        if (!interaction.message) {
            await interaction.reply({
                content: `${config.emojis.error} Failed to fetch the log message.`,
                ephemeral: true
            });
            return;
        }

        // The value of the "Message" text input field
        const editedMessage = interaction.components[0].components[0].value;

        const dmEmbed = EmbedBuilder.from(directMessage.embeds[0])
            .setFields({
                name: "Message",
                value: editedMessage
            });

        const logEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .spliceFields(1, 1, {
                name: "Message",
                value: editedMessage
            });

        await Promise.all([
            directMessage.edit({ embeds: [dmEmbed] }),
            interaction.message.edit({ embeds: [logEmbed] })
        ]);

        await interaction.reply({
            content: `${config.emojis.success} Successfully edited the message.`,
            ephemeral: true
        });
    }
}