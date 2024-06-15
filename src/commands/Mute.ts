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

import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";

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
                    name: "user",
                    description: "The user to mute",
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
        const member = interaction.options.getMember("user");
        const user = member?.user ?? interaction.options.getUser("user", true);
        const validationResult = await InfractionUtil.validateReason(reason, config);

        if (!validationResult.success) {
            return {
                content: validationResult.message,
                temporary: true
            };
        }

        if (member) {
            if (!member.manageable || !interaction.appPermissions.has(PermissionFlagsBits.ModerateMembers)) {
                return {
                    content: "I do not have permission to mute this user",
                    temporary: true
                };
            }

            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return {
                    content: "You cannot mute a user with a higher or equal role",
                    temporary: true
                };
            }

            if (member.isCommunicationDisabled()) {
                return {
                    content: "You can't mute someone who is already muted",
                    temporary: true
                };
            }
        } else {
            const isMuted = await InfractionManager.getActiveMute(user.id, interaction.guildId);

            if (isMuted) {
                return {
                    content: "You can't mute someone who is already muted",
                    temporary: true
                };
            }
        }

        if (!DURATION_FORMAT.test(duration)) {
            return {
                content: `Invalid duration format. Please use the following format: \`<number><unit>\` (e.g. \`1d\`, \`2h\`, \`15m\`)`,
                temporary: true
            };
        }

        // Reset the regex index
        DURATION_FORMAT.lastIndex = 0;

        let msDuration = ms(duration);

        if (msDuration > MAX_MUTE_DURATION) msDuration = MAX_MUTE_DURATION;
        if (msDuration <= 0) {
            return {
                content: "Invalid duration. Please use a duration greater than `0`",
                temporary: true
            };
        }

        const isBanned = await interaction.guild.bans.fetch(user)
            .then(() => true)
            .catch(() => false);

        if (isBanned) {
            return {
                content: "You can't mute a banned user.",
                temporary: true
            };
        }

        const msExpiresAt = Date.now() + msDuration;
        const expiresAt = new Date(msExpiresAt);

        const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
        const infraction = await InfractionManager.storeInfraction({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: InfractionAction.Mute,
            target_id: user.id,
            expires_at: expiresAt,
            reason
        });

        if (member) {
            try {
                await member.timeout(msDuration, reason);
            } catch (error) {
                const sentryId = Sentry.captureException(error);
                InfractionManager.deleteInfraction(infraction.id);

                return {
                    content: `An error occurred while muting the member (\`${sentryId}\`)`,
                    temporary: true
                };
            }
        }

        InfractionManager.logInfraction(infraction, interaction.member, config);

        const formattedReason = InfractionUtil.formatReason(reason);
        const message = `set ${user} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`;

        if (interaction.channel && config.channelInScope(interaction.channel)) {
            config.sendNotification(`${interaction.user} ${message}`, false);
        }

        if (member) {
            return {
                content: `Successfully ${message}`,
                temporary: true
            };
        } else {
            return {
                content: `User not in server, I will try to ${message.replace("-", "if they rejoin -")}`,
                temporary: true
            };
        }
    }
}