import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { InteractionReplyData } from "@utils/types";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Sentry from "@sentry/node";

export default class Unmute extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "unmute",
            description: "Unmute a member in the server",
            options: [
                {
                    name: "user",
                    description: "The user to unmute",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "reason",
                    description: "The reason for unmuting the member",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const member = interaction.options.getMember("user");
        const user = member?.user ?? interaction.options.getUser("user", true);
        const validationResult = await InfractionUtil.validateReason(reason, config);

        if (!validationResult.success) {
            return validationResult.message;
        }

        if (member) {
            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return "You can't unmute someone with the same or higher role than you";
            }

            if (!member.isCommunicationDisabled()) {
                return "You can't unmute someone who isn't muted";
            }
        } else {
            const isMuted = await InfractionManager.getActiveMute(user.id, interaction.guildId);

            if (!isMuted) {
                return "There are no active mutes for this user";
            }
        }

        const infraction = await InfractionManager.storeInfraction({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: InfractionAction.Unmute,
            target_id: user.id,
            reason
        });

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        if (member) {
            try {
                await member.timeout(null, reason);
            } catch (error) {
                const sentryId = Sentry.captureException(error);
                InfractionManager.deleteInfraction(infraction.id);

                return `An error occurred while unmuting the member (\`${sentryId}\`)`;
            }
        }

        InfractionManager.logInfraction(infraction, interaction.member, config);
        await InfractionManager.endActiveMutes(interaction.guildId, user.id);

        const formattedReason = InfractionUtil.formatReason(reason);
        const message = `unmuted ${user} - \`#${infraction.id}\` ${formattedReason}`;

        if (interaction.channel && config.channelInScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} ${message}`, false);
        }

        if (member) {
            return `Successfully ${message}`;
        } else {
            return `User not in server, I will try to unmute ${user} if they rejoin - \`#${infraction.id}\` ${formattedReason}`;
        }
    }
}