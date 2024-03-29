import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction } from "discord.js";
import { InteractionResponseType } from "@bot/types/interactions";
import { Command } from "@bot/handlers/interactions/interaction";
import { PunishmentType } from "@database/models/infraction";
import { resolveInfraction } from "@bot/utils/moderation";
import { ensureError, formatReason } from "@bot/utils";

import Config from "@bot/utils/config";

export default class UnbanCommand extends Command {
    constructor() {
        super({
            name: "unban",
            description: "Unbans a banned user.",
            type: ApplicationCommandType.ChatInput,
            defer: InteractionResponseType.Default,
            skipEphemeralCheck: false,
            options: [
                {
                    name: "user",
                    description: "The user to unban",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "reason",
                    description: "The reason for unbanning the user",
                    type: ApplicationCommandOptionType.String,
                    max_length: 1024
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">, ephemeral: boolean, config: Config): Promise<void> {
        const target = interaction.options.getUser("user", true);
        const targetIsBanned = await interaction.guild.bans.fetch(target.id)
            .then(() => true)
            .catch(() => false);

        const { emojis } = config;

        if (!targetIsBanned) {
            await interaction.reply({
                content: `${emojis.error} This user is not banned.`,
                ephemeral
            });
            return;
        }

        const reason = interaction.options.getString("reason") ?? undefined;

        try {
            await interaction.guild.members.unban(target, reason);
            await resolveInfraction({
                punishment: PunishmentType.Unban,
                executorId: interaction.user.id,
                targetId: target.id,
                guildId: interaction.guildId,
                reason
            });
        } catch (_error) {
            const error = ensureError(_error);
            await interaction.reply({
                content: `${emojis.error} ${error.message}`,
                ephemeral
            });

            return;
        }

        const confirmation = config.formatConfirmation(`unbanned ${target}`, {
            executorId: interaction.user.id,
            success: true,
            reason
        });

        await Promise.all([
            interaction.reply({
                content: `${emojis.success} Successfully unbanned ${target}${formatReason(reason)}`,
                ephemeral
            }),
            config.sendNotification(confirmation, {
                sourceChannelId: interaction.channelId
            })
        ]);
    }
}