import { ApplicationCommandOptionType, ChatInputCommandInteraction, time, TimestampStyles } from "discord.js";
import { handleInfractionCreate } from "../utils/infractions.ts";
import { Action, InteractionReplyData } from "../utils/types.ts";
import { EMBED_FIELD_CHAR_LIMIT, EMPTY_INFRACTION_REASON } from "../utils/constants.ts";
import { ConfigManager } from "../utils/config.ts";

import Command from "../handlers/commands/Command.ts";
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
        const member = interaction.options.getMember("user");

        if (!member) {
            return "You can't mute someone who isn't in the server";
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return "You can't mute someone with the same or higher role than you";
        }

        if (member.isCommunicationDisabled()) {
            return "You can't mute someone who is already muted";
        }

        if (!DURATION_FORMAT.test(duration)) {
            return `Invalid duration format. Please use the following format: \`<number><unit>\` (e.g. \`1d\`, \`2h\`, \`15m\`)`;
        }

        let parsedDuration = ms(duration);

        if (parsedDuration > ONE_WEEK) parsedDuration = ONE_WEEK;
        if (parsedDuration <= 0) return "Invalid duration. Please use a duration greater than `0`";

        await member.timeout(parsedDuration, reason);

        const expiresTimestamp = Date.now() + parsedDuration;
        const expiresAt = new Date(expiresTimestamp);
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

        return `Successfully set ${member} on a timeout that will end \`${relativeTimestamp}\` - \`#${infraction.id}\` (\`${reason}\`)`;
    }
}