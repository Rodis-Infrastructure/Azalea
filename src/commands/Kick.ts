import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { handleInfractionCreate } from "@utils/infractions";
import { Action, InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

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
        const reason = interaction.options.getString("reason") ?? EMPTY_INFRACTION_REASON;
        const member = interaction.options.getMember("member");

        // Check if the member is in the server
        // Users that are not in the server cannot be kicked
        if (!member) {
            return "You can't kick someone who isn't in the server";
        }

        // Compare roles to ensure the executor has permission to kick the target
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't kick someone with the same or higher role than you";
        }

        if (!member.kickable) {
            return "I do not have permission to kick this user";
        }

        // Kick the user
        await member.kick(reason);

        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Kick,
            target_id: member.id,
            reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        // Ensure a public log of the action is made
        if (interaction.channel && config.inScope(interaction.channel, config.data.ephemeral_scoping)) {
            config.sendNotification(`${interaction.user} kicked ${member} - \`#${infraction.id}\` (\`${reason}\`)`, false);
        }

        return `Successfully kicked ${member} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}