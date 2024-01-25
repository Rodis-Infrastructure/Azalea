import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { handleInfractionCreate, handleInfractionExpirationChange } from "../utils/infractions.ts";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "../utils/constants.ts";
import { Action, InteractionReplyData } from "../utils/types.ts";
import { ConfigManager } from "../utils/config.ts";

import Command from "../handlers/commands/Command.ts";

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
        const member = interaction.options.getMember("user");

        if (!member) {
            return "You can't unmute someone who isn't in the server";
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't unmute someone with the same or higher role than you";
        }

        if (!member.isCommunicationDisabled()) {
            return "You can't unmute someone who isn't muted";
        }

        // Setting the duration to null will end the timeout
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

        await handleInfractionExpirationChange({
            id: infraction.id,
            expires_at: new Date(),
            updated_by: interaction.user.id
        }, config, false);

        return `Successfully unmuted ${member} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}