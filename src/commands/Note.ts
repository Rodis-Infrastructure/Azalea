import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

/**
 * Add a note to the user's infraction history. Upon adding the note,
 * the command will log the action in the channel configured for {@link LoggingEvent.InfractionCreate} logs
 * and store the infraction in the database
 */
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
                    description: "The note to add",
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
        const validationResult = await InfractionUtil.validateReason(note, config);

        if (!validationResult.success) {
            return {
                content: validationResult.message,
                temporary: true
            };
        }

        if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
            return {
                content: "You cannot add a note to a user with a higher or equal role",
                temporary: true
            };
        }

        const user = member?.user ?? interaction.options.getUser("user", true);
        const infraction = await InfractionManager.storeInfraction({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: InfractionAction.Note,
            target_id: user.id,
            reason: note
        });

        InfractionManager.logInfraction(infraction, interaction.member, config);

        const formattedReason = InfractionUtil.formatReason(note);
        const message = `added a note to ${user} - \`#${infraction.id}\` ${formattedReason}`;

        if (interaction.channel && config.channelInScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} ${message}`, false);
        }

        return {
            content: `Successfully ${message}`,
            temporary: true
        };
    }
}