import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "../utils/constants.ts";
import { handleInfractionCreate } from "../utils/infractions.ts";
import { Action, InteractionReplyData } from "../utils/types.ts";
import { ConfigManager } from "../utils/config.ts";

import Command from "../handlers/commands/Command.ts";

// Constants
const TWO_WEEKS = 1000 * 60 * 60 * 24 * 7 * 2;

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
        const deleteMessageSeconds = interaction.options.getBoolean("delete_messages") ? TWO_WEEKS : 0;
        const reason = interaction.options.getString("reason") ?? EMPTY_INFRACTION_REASON;
        const member = interaction.options.getMember("member");

        if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't kick someone with the same or higher role than you";
        }

        const user = member?.user ?? interaction.options.getUser("user", true);
        const ban = await interaction.guild.bans.fetch(user.id).catch(() => null);

        if (ban) {
            return `This user is already banned: \`${ban.reason ?? EMPTY_INFRACTION_REASON}\``;
        }

        await interaction.guild.members.ban(user, { reason, deleteMessageSeconds });

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

        return `Successfully banned ${user} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}