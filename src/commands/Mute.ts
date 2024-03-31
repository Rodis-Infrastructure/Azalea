import { ApplicationCommandOptionType, ChatInputCommandInteraction, time, TimestampStyles } from "discord.js";
import { handleInfractionCreate } from "@utils/infractions";
import { Action, InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import ms from "ms";

// Constants
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
const DURATION_FORMAT = /^(\d+ *(days?|h(ou)?rs?|min(utes?)?|[mhd]) *)+$/gmi;

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
        const duration = interaction.options.getString("duration", true);
        const reason = interaction.options.getString("reason") ?? EMPTY_INFRACTION_REASON;
        const member = interaction.options.getMember("member");

        // Check if the member is in the server
        // Users that are not in the server cannot be muted
        if (!member) {
            return "You can't mute someone who isn't in the server";
        }

        // Compare roles to ensure the executor has permission to mute the target
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't mute someone with the same or higher role than you";
        }

        // Check if the bot has permission to mute the member
        if (!member.manageable) {
            return "I do not have permission to mute this user";
        }

        // Check if the member is already muted
        if (member.isCommunicationDisabled()) {
            return "You can't mute someone who is already muted";
        }

        // Validate the duration format using regex
        if (!DURATION_FORMAT.test(duration)) {
            return `Invalid duration format. Please use the following format: \`<number><unit>\` (e.g. \`1d\`, \`2h\`, \`15m\`)`;
        }

        // Convert the string duration to milliseconds
        let parsedDuration = ms(duration);

        // Set the duration to 2 weeks if it exceeds that
        if (parsedDuration > ONE_WEEK) parsedDuration = ONE_WEEK;
        if (parsedDuration <= 0) return "Invalid duration. Please use a duration greater than `0`";

        // Mute the member
        await member.timeout(parsedDuration, reason);

        // Calculate the expiration date
        const expiresTimestamp = Date.now() + parsedDuration;
        const expiresAt = new Date(expiresTimestamp);

        // Create a relative expiration timestamp
        // This will be used to display the time left until the mute expires
        const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);

        const infraction = await handleInfractionCreate({
            executor_id: interaction.user.id,
            guild_id: interaction.guildId,
            action: Action.Mute,
            target_id: member.id,
            expires_at: expiresAt,
            reason
        }, config);

        if (!infraction) {
            return "An error occurred while storing the infraction";
        }

        return `Successfully set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}