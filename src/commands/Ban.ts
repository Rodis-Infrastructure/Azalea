import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { Action, handleInfractionCreate } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

// Constants
const DEFAULT_DELETE_MESSAGE_SECONDS = 604800;

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
                    name: "delete_messages",
                    description: "Whether to delete the user's messages",
                    type: ApplicationCommandOptionType.Boolean
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const member = interaction.options.getMember("user");

        // Delete 2 weeks' worth of messages if the option is true
        const deleteMessageSeconds = interaction.options.getBoolean("delete_messages")
            ? DEFAULT_DELETE_MESSAGE_SECONDS
            : 0;

        if (member && !member.bannable) {
            return "I do not have permission to ban this user";
        }

        if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You cannot ban a user with a higher or equal role";
        }

        const user = member?.user ?? interaction.options.getUser("user", true);

        // Check if the user is already banned by fetching their ban
        // If they are banned, the method will return their ban data
        // Otherwise, it will return null
        const ban = await interaction.guild.bans
            .fetch(user.id)
            .catch(() => null);

        if (ban) {
            return `This user is already banned: \`${ban.reason ?? DEFAULT_INFRACTION_REASON}\``;
        }

        // Ban the user
        await interaction.guild.members.ban(user, { reason, deleteMessageSeconds });

        // Log the infraction and store it in the database
        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Ban,
            target_id: user.id,
            reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        // Ensure a public log of the action is made
        if (interaction.channel && config.inScope(interaction.channel, config.data.ephemeral_scoping)) {
            config.sendNotification(`${interaction.user} banned ${user} - \`#${infraction.id}\` (\`${reason}\`)`, false);
        }

        return `Successfully banned ${user} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}