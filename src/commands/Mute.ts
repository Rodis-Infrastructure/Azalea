import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    time,
    TimestampStyles
} from "discord.js";

import {
    EMBED_FIELD_CHAR_LIMIT,
    DEFAULT_INFRACTION_REASON,
    MAX_MUTE_DURATION,
    DURATION_FORMAT
} from "@utils/constants";

import { Action, getActiveMute, handleInfractionCreate, validateInfractionReason } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { formatInfractionReason } from "@/utils";
import { prisma } from "./..";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import ms from "ms";
import Sentry from "@sentry/node";

/**
 * Mute a member in the server.
 * The following requirements must be met for the command to be successful:
 *
 * 1. The target must be in the guild
 * 2. The target must be manageable by the client
 * 3. Check if the client has the `ModerateMembers` permission
 * 4. The target must not be muted
 * 5. The passed duration must have a valid format
 * 6. The duration must be greater than 0 and less than or equal to 1 week
 *
 * Upon muting the member, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs and store the infraction in the database
 */
export default class Mute extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "mute",
            description: "Mute a member in the server",
            options: [
                {
                    name: "member",
                    description: "The member to mute",
                    type: ApplicationCommandOptionType.User,
                    required: true
                },
                {
                    name: "duration",
                    description: "The duration to mute for",
                    type: ApplicationCommandOptionType.String,
                    required: true
                },
                {
                    name: "reason",
                    description: "The reason for muting the member",
                    type: ApplicationCommandOptionType.String,
                    maxLength: EMBED_FIELD_CHAR_LIMIT
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const duration = interaction.options.getString("duration", true).trim();
        const reason = interaction.options.getString("reason") ?? DEFAULT_INFRACTION_REASON;
        const member = interaction.options.getMember("member");
        const user = member?.user ?? interaction.options.getUser("member", true);
        const validationResult = await validateInfractionReason(reason, config);

        if (!validationResult.success) {
            return validationResult.message;
        }

        // Check if the member is in the server
        if (member) {
            // Check if the bot has permission to mute the member
            if (!member.manageable || !interaction.appPermissions.has(PermissionFlagsBits.ModerateMembers)) {
                return "I do not have permission to mute this user";
            }

            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return "You cannot mute a user with a higher or equal role";
            }

            // Check if the member is already muted
            if (member.isCommunicationDisabled()) {
                return "You can't mute someone who is already muted";
            }
        } else {
            const mute = await getActiveMute(user.id, interaction.guildId);

            // Check if the user is already muted through their infraction history
            if (mute) {
                return "You can't mute someone who is already muted";
            }
        }

        // Validate the duration format using regex
        if (!DURATION_FORMAT.test(duration)) {
            return `Invalid duration format. Please use the following format: \`<number><unit>\` (e.g. \`1d\`, \`2h\`, \`15m\`)`;
        }

        // Reset the regex index
        DURATION_FORMAT.lastIndex = 0;

        // Convert the string duration to milliseconds
        let msDuration = ms(duration);

        // Set the duration to 1 week if it exceeds that
        if (msDuration > MAX_MUTE_DURATION) msDuration = MAX_MUTE_DURATION;
        if (msDuration <= 0) return "Invalid duration. Please use a duration greater than `0`";

        // Calculate the expiration date
        const msExpiresAt = Date.now() + msDuration;
        const expiresAt = new Date(msExpiresAt);

        // Create a relative expiration timestamp
        // This will be used to display the time left until the mute expires
        const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);

        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Mute,
            target_id: user.id,
            expires_at: expiresAt,
            reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        if (member) {
            try {
                // Mute the user
                await member.timeout(msDuration, reason).catch(() => null);
            } catch (error) {
                const sentryId = Sentry.captureException(error);

                // If the mute fails, rollback the infraction
                await prisma.infraction.delete({ where: { id: infraction.id } });
                return `An error occurred while muting the member (\`${sentryId}\`)`;
            }
        }

        const formattedReason = formatInfractionReason(reason);

        // Ensure a public log of the action is made if executed ephemerally
        if (interaction.channel && config.inScope(interaction.channel, config.data.ephemeral_scoping)) {
            config.sendNotification(`${interaction.user} set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`, false);
        }

        if (member) {
            return `Successfully set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`;
        } else {
            return `Successfully stored the infraction (\`#${infraction.id}\`) but failed to mute the user as they are not in the server, I will try to mute them if they join back.`;
        }
    }
}