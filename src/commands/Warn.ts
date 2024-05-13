import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { Action, handleInfractionCreate } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

/**
 * Add a note to a user's infraction history.
 * The following requirements must be met:
 *
 * 1. The target must be manageable to the client
 *
 * Upon adding the note, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs and store the infraction in the database
 */
export default class Warn extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "warn",
            description: "Warns the user",
            options: [
                {
                    name: "user",
                    description: "The user to warn",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "reason",
                    description: "The reason of the warn",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT,
                    required: true
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const reason = interaction.options.getString("reason", true);
        const member = interaction.options.getMember("user");

        if (member && !member.manageable) {
            return "I cannot warn this user.";
        }

        if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You cannot warn a user with a higher or equal role";
        }

        const user = member?.user ?? interaction.options.getUser("user", true);
        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Warn,
            target_id: user.id,
            reason: reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        // Ensure a public log of the action is made
        if (interaction.channel && config.inScope(interaction.channel, config.data.ephemeral_scoping)) {
            config.sendNotification(`${interaction.user} warned ${user} - \`#${infraction.id}\` (\`${reason}\`)`, false);
        }

        return `Successfully warned ${user} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}