import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { handleInfractionCreate } from "@utils/infractions";
import { Action, InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

export default class Note extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "note",
            description: "Add a note to a user's infraction history",
            options: [
                {
                    name: "user",
                    description: "The user to add a note to",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "note",
                    description: "The content of the note",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT,
                    required: true
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const note = interaction.options.getString("note", true);
        const member = interaction.options.getMember("user");

        // Compare roles to ensure the executor has permission to add a note to the target
        if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't add a note to someone with the same or higher role than you";
        }

        const user = member?.user ?? interaction.options.getUser("user", true);
        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Note,
            target_id: user.id,
            reason: note
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        // Ensure a public log of the action is made
        if (interaction.channel && config.inLoggingScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} added a note to ${user} - \`#${infraction.id}\` (\`${note}\`)`, false);
        }

        return `Successfully added a note to ${user}'s infraction history - \`#${infraction.id}\` (\`${note}\`)`;
    }
}