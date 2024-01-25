import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { handleInfractionCreate } from "../utils/infractions.ts";
import { EMBED_FIELD_CHAR_LIMIT } from "../utils/constants.ts";
import { ConfigManager } from "../utils/config.ts";
import { Action } from "../utils/types.ts";

import Command from "../handlers/commands/Command.ts";

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
                    name: "content",
                    description: "The content of the note",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT,
                    required: true
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const content = interaction.options.getString("content", true);
        const user = interaction.options.getUser("user", true);

        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Note,
            target_id: user.id,
            reason: content,
            request_author_id: null,
            expires_at: null,
            flag: null
        }, config);

        await interaction.reply({
            content: `Successfully added note \`#${infraction.id}\` to ${user}'s infraction history (\`${content}\`)`,
            allowedMentions: { parse: [] },
            ephemeral: true
        });
    }
}