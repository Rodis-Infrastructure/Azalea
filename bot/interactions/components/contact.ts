import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, ModalSubmitInteraction } from "discord.js";
import { Component } from "@bot/handlers/interactions/interaction";
import { InteractionResponseType } from "@bot/types/interactions";
import { msToString, TICKET_CLOSE_TIMEOUT } from "@bot/utils";
import { getQuery, runQuery } from "@database/utils";
import { Ticket } from "@database/models/ticket";
import { BotChannel } from "@bot/types/config";

import Config from "@bot/utils/config";

export default class Contact extends Component<ModalSubmitInteraction<"cached">> {
    constructor() {
        super({
            // Format: contact-<userId>
            name: { startsWith: "contact" },
            defer: InteractionResponseType.Default,
            skipInternalUsageCheck: false
        });
    }

    async execute(interaction: ModalSubmitInteraction<"cached">, _ephemeral: never, config: Config): Promise<void> {
        const targetId = interaction.customId.split("-")[1];
        const target = await interaction.client.users.fetch(targetId).catch(() => null);

        const { emojis } = config;

        if (!target) {
            await interaction.reply({
                content: `${emojis.error} Failed to fetch the target member.`,
                ephemeral: true
            });
            return;
        }

        const ticketChannel = await config.fetchChannel(BotChannel.Tickets);

        if (!ticketChannel) {
            await interaction.reply({
                content: `${emojis.error} Failed to fetch the ticket channel, please check if it exists.`,
                ephemeral: true
            });
            return;
        }

        // The value of the "Message" text input field
        const messageContent = interaction.components[0].components[0].value;
        const strDuration = msToString(TICKET_CLOSE_TIMEOUT);

        /** Embed sent to the user */
        const dmEmbed = new EmbedBuilder()
            .setColor(Colors.NotQuiteBlack)
            .setAuthor({
                name: `Message from ${interaction.guild.name}`,
                iconURL: interaction.guild.iconURL() || undefined
            })
            .setDescription(`You have received a message from a member of staff in **${interaction.guild.name}**`)
            .setFields({ name: "Message", value: messageContent })
            .setFooter({ text: `This conversation will end in ${strDuration}` })
            .setTimestamp();

        /** Embed sent in the ticket channel */
        const logEmbed = new EmbedBuilder()
            .setColor(0x9C84EF)
            .setFields([
                {
                    name: "User",
                    value: `${target}`
                },
                {
                    name: "Message",
                    value: messageContent
                }
            ])
            .setFooter({ text: `ID: ${interaction.user.id}` })
            .setTimestamp();

        const editBtn = new ButtonBuilder()
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Edit");

        const endConversationBtn = new ButtonBuilder()
            .setCustomId(`ticket-close-${targetId}`)
            .setLabel("End Conversation")
            .setStyle(ButtonStyle.Danger);

        try {
            const directMessage = await target.send({ embeds: [dmEmbed] });
            editBtn.setCustomId(`ticket-prompt-edit-${targetId}-${directMessage.id}`);
        } catch {
            await interaction.reply({
                content: `${emojis.error} Failed to send the message to the user, they may have their DMs disabled.`,
                ephemeral: true
            });
            return;
        }

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(endConversationBtn, editBtn);

        const openTicket = await getQuery<Pick<Ticket, "last_message_id" | "participants">>(`
            SELECT last_message_id, participants
            FROM tickets
            WHERE target_id = ${target.id};
        `);

        // Start a new conversation
        if (!openTicket) {
            logEmbed.setAuthor({
                name: `Conversation started by ${interaction.user.tag}`,
                iconURL: interaction.user.displayAvatarURL()
            });

            const log = await ticketChannel.send({
                embeds: [logEmbed],
                components: [actionRow]
            });

            await Promise.all([
                interaction.reply({
                    content: `${emojis.success} Successfully sent the message to ${target}: ${log.url}`,
                    ephemeral: true
                }),
                // @formatter:off
                runQuery(`
                    INSERT INTO tickets (target_id, initiator_id, participants, guild_id, expires_at, first_message_id, last_message_id)
                    VALUES (
                        ${targetId},
                        ${interaction.user.id},
                        ${interaction.user.id},
                        ${interaction.guildId},
                        ${Date.now() + TICKET_CLOSE_TIMEOUT},
                        ${log.id},
                        ${log.id}
                    )
                `)
            ]);

            return;
        }

        // @formatter:on
        const previousLogMessage = await ticketChannel.messages.fetch(openTicket.last_message_id);

        logEmbed.setAuthor({
            name: `Response from ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL()
        });

        const [log] = await Promise.all([
            previousLogMessage.reply({
                embeds: [logEmbed],
                components: [actionRow]
            }),
            previousLogMessage.edit({
                components: []
            })
        ]);

        const participants = new Set([
            ...openTicket.participants.split(","),
            interaction.user.id
        ]);

        await Promise.all([
            interaction.reply({
                content: `${emojis.success} Successfully sent the message to ${target}: ${log.url}`,
                ephemeral: true
            }),
            runQuery(`
                UPDATE tickets
                SET participants    = '${Array.from(participants).join(",")}',
                    last_message_id = ${log.id},
                    expires_at      = ${Date.now() + TICKET_CLOSE_TIMEOUT}
                WHERE target_id = ${target.id}
            `)
        ]);
    }
}