import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";

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
        const validationResult = await InfractionUtil.validateReason(reason, config);

        if (!validationResult.success) {
            return {
                content: validationResult.message,
                temporary: true
            };
        }

        const isBanned = await interaction.guild.bans.fetch(user.id)
            .then(() => true)
            .catch(() => false);

        if (!isBanned) {
            return {
                content: "This user is not banned",
                temporary: true
            };
        }

        const infraction = await InfractionManager.storeInfraction({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: InfractionAction.Unban,
            target_id: user.id,
            reason
        });

        try {
            await interaction.guild.members.unban(user, reason);
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            InfractionManager.deleteInfraction(infraction.id);

            return {
                content: `An error occurred while unbanning the member (\`${sentryId}\`)`,
                temporary: true
            };
        }

        InfractionManager.logInfraction(infraction, interaction.member, config);

        const formattedReason = InfractionUtil.formatReason(reason);
        const message = `unbanned ${user} - \`#${infraction.id}\` ${formattedReason}`;

        if (interaction.channel && config.channelInScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} ${message}`, false);
        }

        return {
            content: `Successfully ${message}`,
            temporary: true
        };
    }
}