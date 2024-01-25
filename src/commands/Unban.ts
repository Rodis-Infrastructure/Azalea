import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "../utils/constants.ts";
import { handleInfractionCreate } from "../utils/infractions.ts";
import { Action, InteractionReplyData } from "../utils/types.ts";
import { ConfigManager } from "../utils/config.ts";

import Command from "../handlers/commands/Command.ts";

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
        const reason = interaction.options.getString("reason") ?? EMPTY_INFRACTION_REASON;
        const member = interaction.options.getMember("member");

        if (member) {
            return "This user is not banned";
        }

        const user = interaction.options.getUser("user", true);
        await interaction.guild.members.unban(user, reason);

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

        return `Successfully unbanned ${user} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}