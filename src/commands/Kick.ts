import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { EMBED_FIELD_CHAR_LIMIT, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { Action, handleInfractionCreate } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Sentry from "@sentry/node";
import { formatInfractionReason } from "@/utils";

/**
 * Kick a member from the server.
 * The following requirements must be met for the command to be successful:
 *
 * 2. The target must be kickable by the client
 * 3. The target must be in the guild
 *
 * Upon kicking the member, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs and store the infraction in the database
 */
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
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const member = interaction.options.getMember("member");

        // Don't allow Discord media links to be present in the reason if disabled
        if (!config.data.allow_discord_media_links && (reason.includes("cdn.discord") || reason.includes("media.discord"))) {
            return "Discord media links are not allowed in infraction reasons";
        }
        
        // Check if the member is in the server
        // Users that are not in the server cannot be kicked
        if (!member) {
            return "You can't kick someone who isn't in the server";
        }

        if (!member.kickable) {
            return "I do not have permission to kick this user";
        }
        
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You cannot kick a user with a higher or equal role";
        }

        // Log the infraction and store it in the database
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

        try {
            // Kick the user
            await member.kick(reason);
        } catch (error) {
            const sentryId = Sentry.captureException(error);

            // If the kick fails, rollback the infraction
            await prisma.infraction.delete({ where: { id: infraction.id } });
            return `An error occurred while kicking the member (\`${sentryId}\`)`;
        }

        const formattedReason = formatInfractionReason(reason);

        // Ensure a public log of the action is made if executed ephemerally
        if (interaction.channel && config.inScope(interaction.channel, config.data.ephemeral_scoping)) {
            config.sendNotification(`${interaction.user} kicked ${member} - \`#${infraction.id}\` ${formattedReason}`, false);
        }

        return `Successfully kicked ${member} - \`#${infraction.id}\` ${formattedReason}`;
    }
}