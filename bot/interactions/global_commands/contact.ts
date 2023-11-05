import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ApplicationCommandType,
    ChatInputCommandInteraction,
    messageLink,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    userMention
} from "discord.js";

import { InteractionResponseType } from "@bot/types/interactions";
import { Command } from "@bot/handlers/interactions/interaction";
import { getQuery } from "@database/utils";
import { Ticket } from "@database/models/ticket";

import Config from "@bot/utils/config";

/** Opens a conversation (ticket) with a user */
export default class ContactCommand extends Command {
    constructor() {
        super({
            name: "contact",
            description: "Start a conversation with a user.",
            type: ApplicationCommandType.ChatInput,
            defer: InteractionResponseType.Default,
            skipInternalUsageCheck: false,
            options: [{
                name: "user",
                description: "The user to contact",
                type: ApplicationCommandOptionType.User,
                required: true
            }]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">, _ephemeral: boolean, config: Config): Promise<void> {
        const target = interaction.options.getUser("user", true);
        const ticketChannelId = config.channels.tickets;

        const { emojis } = config;

        if (!ticketChannelId) {
            await interaction.reply({
                content: `${emojis.error} The ticket channel has not been set up.`,
                ephemeral: true
            });
            return;
        }

        const openTicket = await getQuery<Pick<Ticket, "first_message_id" | "initiator_id">>(`
            SELECT first_message_id, initiator_id
            FROM tickets
            WHERE target_id = ${target.id};
        `);

        if (openTicket) {
            const jumpURL = messageLink(ticketChannelId, openTicket.first_message_id, config.guildId);
            await interaction.reply({
                content: `${emojis.error} A conversation with this user has already been opened by ${userMention(openTicket.initiator_id)}: ${jumpURL}`,
                ephemeral: true
            });
            return;
        }

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
            .setCustomId(`contact-${target.id}`)
            .setTitle(`Contact ${target.tag}`)
            .setComponents(actionRow);

        await interaction.showModal(modal);
    }
}