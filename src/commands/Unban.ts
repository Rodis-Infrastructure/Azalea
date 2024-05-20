import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { Action, handleInfractionCreate, validateInfractionReason } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { formatInfractionReason } from "@/utils";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Sentry from "@sentry/node";

export default class Unban extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "unban",
            description: "Unban a user from the server",
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
                    maxLength: EMBED_FIELD_CHAR_LIMIT
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const user = interaction.options.getUser("user", true);
        const validationResult = await validateInfractionReason(reason, config);

        if (!validationResult.success) {
            return validationResult.message;
        }

        // Check if the user is banned by fetching their ban
        // If they are banned, the method will return their ban data
        // Otherwise, it will return null
        const ban = await interaction.guild.bans.fetch(user.id).catch(() => null);

        if (!ban) {
            return "This user is not banned";
        }

        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Unban,
            target_id: user.id,
            reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        try {
            // Unban the user
            await interaction.guild.members.unban(user, reason);
        } catch (error) {
            const sentryId = Sentry.captureException(error);

            // If the unban fails, rollback the infraction
            await prisma.infraction.delete({ where: { id: infraction.id } });
            return `An error occurred while unbanning the member (\`${sentryId}\`)`;
        }

        const formattedReason = formatInfractionReason(reason);

        // Ensure a public log of the action is made if executed ephemerally
        if (interaction.channel && config.inScope(interaction.channel, config.data.ephemeral_scoping)) {
            config.sendNotification(`${interaction.user} unbanned ${user} - \`#${infraction.id}\` ${formattedReason}`, false);
        }

        return `Successfully unbanned ${user} - \`#${infraction.id}\` ${formattedReason}`;
    }
}