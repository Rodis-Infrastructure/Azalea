import { ApplicationCommandOptionType, ApplicationCommandType, ChatInputCommandInteraction } from "discord.js";
import { resolveInfraction, validateModerationAction } from "../../utils/ModerationUtils";
import { InfractionType, InteractionResponseType } from "../../utils/Types";

import ChatInputCommand from "../../handlers/interactions/commands/ChatInputCommand";
import Config from "../../utils/Config";

export default class BanCommand extends ChatInputCommand {
    constructor() {
        super({
            name: "ban",
            description: "Ban a user from the guild.",
            type: ApplicationCommandType.ChatInput,
            defer: InteractionResponseType.Defer,
            skipInternalUsageCheck: false,
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
                    max_length: 1024
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction, config: Config): Promise<void> {
        const user = interaction.options.getUser("user", true);
        const [member, isBanned] = await Promise.all([
            interaction.guild!.members.fetch(user.id),
            interaction.guild!.bans.fetch(user.id)
        ]).catch(() => []);

        const { success, error } = config.emojis;

        if (member) {
            const notModerateableReason = validateModerationAction({
                config,
                moderatorId: interaction.user.id,
                offender: member,
                additionalValidation: [{
                    condition: !member.bannable,
                    reason: "I do not have permission to ban this member."
                }]
            });

            if (notModerateableReason) {
                await interaction.editReply(`${error} ${notModerateableReason}`);
                return;
            }
        }

        if (isBanned) {
            await interaction.editReply(`${error} This user has already been banned.`);
            return;
        }

        let deleteMessageSeconds = config.deleteMessageSecondsOnBan;

        /* Minimum value */
        if (deleteMessageSeconds < 0) deleteMessageSeconds = 0;
        /* Maximum value */
        if (deleteMessageSeconds > 604800) deleteMessageSeconds = 604800;

        try {
            const reason = interaction.options.getString("reason") ?? undefined;

            await interaction.guild!.members.ban(user, { deleteMessageSeconds, reason });
            await Promise.all([
                resolveInfraction({
                    infractionType: InfractionType.Ban,
                    moderator: interaction.user,
                    offender: user,
                    guildId: interaction.guildId!,
                    reason
                }),

                interaction.editReply(`${success} Successfully banned **${user.tag}**${reason ? ` (\`${reason}\`)` : ""}`)
            ]);
        } catch {
            await interaction.editReply(`${error} An error has occurred while trying to ban this user.`);
        }
    }
}