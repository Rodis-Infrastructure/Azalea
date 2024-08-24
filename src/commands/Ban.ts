import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { InteractionReplyData } from "@utils/types";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Sentry from "@sentry/node";

export const SECONDS_IN_DAY = 86400;

/**
 * Bans a user from the server.
 * The following requirements must be met for the command to be successful:
 *
 * 2. The target user must be bannable by the client.
 * 3. The target user must not already be banned
 *
 * If the `delete_messages` option is set to `true`,
 * the client will delete the user's messages from the past **2 weeks**.
 *
 * Upon banning the user, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs and store the infraction in the database
 */
export default class Ban extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "ban",
            description: "Ban a user from the server",
            options: [
                {
                    name: "user",
                    description: "The user to ban",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "reason",
                    description: "The reason for banning the user",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT
                },
                {
                    name: "delete_message_days",
                    description: "The number of days worth of messages to delete from the user",
                    type: ApplicationCommandOptionType.Integer,
                    min_value: 0,
                    max_value: 7
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const member = interaction.options.getMember("user");
        const validationResult = await InfractionUtil.validateReason(reason, config);

        if (!validationResult.success) {
            return {
                content: validationResult.message,
                temporary: true
            };
        }

        if (member) {
            if (!member.bannable) {
                return {
                    content: "I do not have permission to ban this user",
                    temporary: true
                };
            }

            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return {
                    content: "You cannot ban a user with a higher or equal role",
                    temporary: true
                };
            }
        }

        const user = member?.user ?? interaction.options.getUser("user", true);
        const ban = await interaction.guild.bans
            .fetch(user.id)
            .catch(() => null);

        if (ban) {
            const formattedReason = InfractionUtil.formatReason(ban.reason ?? DEFAULT_INFRACTION_REASON);
            return {
                content: `This user is already banned ${formattedReason}`,
                temporary: true
            };
        }

        const infraction = await InfractionManager.storeInfraction({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: InfractionAction.Ban,
            target_id: user.id,
            reason
        });

        const deleteMessageDays = interaction.options.getInteger("delete_message_days")
            ?? config.data.delete_message_days_on_ban;
        const deleteMessageSeconds = deleteMessageDays * SECONDS_IN_DAY;

        try {
            await interaction.guild.members.ban(user, { reason, deleteMessageSeconds });
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            await InfractionManager.deleteInfraction(infraction.id);

            return {
                content: `An error occurred while banning the member (\`${sentryId}\`)`,
                temporary: true
            };
        }

        InfractionManager.logInfraction(infraction, interaction.member, config);

        const formattedReason = InfractionUtil.formatReason(reason);
        const message = `banned ${user} - \`#${infraction.id}\` ${formattedReason}`;

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