import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { handleInfractionCreate, handleInfractionExpirationChange } from "@utils/infractions";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "@utils/constants";
import { Action, InteractionReplyData } from "@utils/types";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

export default class Unmute extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "unmute",
            description: "Unmute a member in the server",
            options: [
                {
                    name: "member",
                    description: "The member to unmute",
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
        const reason = interaction.options.getString("reason") ?? EMPTY_INFRACTION_REASON;
        const member = interaction.options.getMember("member");

        // Check if the member is in the server
        // Users that are not in the server cannot be unmuted
        if (!member) {
            return "You can't unmute someone who isn't in the server";
        }

        // Compare roles to ensure the executor has permission to unmute the target
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't unmute someone with the same or higher role than you";
        }

        // Check if the member is muted
        if (!member.isCommunicationDisabled()) {
            return "You can't unmute someone who isn't muted";
        }

        // Unmute the user by setting the duration of the mute to null
        await member.timeout(null, reason);

        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Unmute,
            target_id: member.id,
            reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        // Update the expiration date of the infraction to the current time
        await handleInfractionExpirationChange({
            id: infraction.id,
            expires_at: new Date(),
            updated_by: interaction.user.id
        }, config, false);

        // Ensure a public log of the action is made
        if (interaction.channel && config.inLoggingScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} unmuted ${member} - \`#${infraction.id}\` (\`${reason}\`)`, false);
        }

        return `Successfully unmuted ${member} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}