import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { handleInfractionCreate } from "../utils/infractions.ts";
import { Action, InteractionReplyData } from "../utils/types.ts";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "../utils/constants.ts";
import { ConfigManager } from "../utils/config.ts";

import Command from "../handlers/commands/Command.ts";

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

        if (!member) {
            return "You can't kick someone who isn't in the server";
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't kick someone with the same or higher role than you";
        }

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

        return `Successfully kicked ${member} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}