import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { captureException } from "@sentry/node";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

/**
 * Kick a member from the server.
 * The following requirements must be met for the command to be successful:
 *
 * 2. The target must be kickable by the client
 * 3. The target must be in the guild
 *
 * Upon kicking the member, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs and store the infraction in the database
 */
export default class Kick extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "kick",
            description: "Kick a member from the server",
            options: [
                {
                    name: "member",
                    description: "The member to kick",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "reason",
                    description: "The reason for kicking the member",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const member = interaction.options.getMember("member");
        const validationResult = await InfractionUtil.validateReason(reason, config);

        if (!validationResult.success) {
            return {
                content: validationResult.message,
                temporary: true
            };
        }

        if (!member) {
            return {
                content: "You can't kick someone who isn't in the server",
                temporary: true
            };
        }

        if (!member.kickable) {
            return {
                content: "I do not have permission to kick this user",
                temporary: true
            };
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return {
                content: "You cannot kick a user with a higher or equal role",
                temporary: true
            };
        }

        // Log the infraction and store it in the database
        const infraction = await InfractionManager.storeInfraction({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: InfractionAction.Kick,
            target_id: member.id,
            reason
        });

        try {
            await member.kick(reason);
        } catch (error) {
            const sentryId = captureException(error);
            await InfractionManager.deleteInfraction(infraction.id);

            return {
                content: `An error occurred while kicking the member (\`${sentryId}\`)`,
                temporary: true
            };
        }

        InfractionManager.logInfraction(infraction, interaction.member, config);

        const formattedReason = InfractionUtil.formatReason(reason);
        const message = `kicked ${member} - \`#${infraction.id}\` ${formattedReason}`;

        // Ensure a public log of the action is made if executed ephemerally
        if (interaction.channel && config.channelInScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} ${message}`, false);
        }

        return {
            content: `Successfully ${message}`,
            temporary: true
        };
    }
}