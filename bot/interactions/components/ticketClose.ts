import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle } from "discord.js";
import { InteractionResponseType } from "@bot/types/interactions";
import { Component } from "@bot/handlers/interactions/interaction";
import { getQuery } from "@database/utils";
import { Ticket } from "@database/models/ticket";

export default class TicketCloseButton extends Component<ButtonInteraction<"cached">> {
    constructor() {
        super({
            // Format: ticket-close-<userId>
            name: { startsWith: "ticket-close" },
            defer: InteractionResponseType.Default,
            skipInternalUsageCheck: false
        });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<void> {
        const targetId = interaction.customId.split("-")[2];
        const target = await interaction.client.users.fetch(targetId)
            .catch(() => null);

        const ticket = await getQuery<Ticket>(`
            DELETE FROM tickets
            WHERE target_id = ${targetId}
            RETURNING *;
        `);

        if (!ticket) {
            await interaction.reply({
                content: "This ticket has already been closed.",
                ephemeral: true
            });
            return;
        }

        const conversationEndedBtn = new ButtonBuilder()
            .setLabel(`Conversation Ended (by ${interaction.user.tag})`)
            .setURL("https://google.com/")
            .setStyle(ButtonStyle.Link)
            .setDisabled(true);

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(conversationEndedBtn);

        await interaction.update({ components: [actionRow] });

        if (target) {
            await target
                .send("The conversation has ended.")
                .catch(() => null);
        }
    }
}