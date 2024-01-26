import { ApplicationCommandType, MessageContextMenuCommandInteraction, time, TimestampStyles } from "discord.js";
import { Action, Flag, InteractionReplyData } from "../utils/types.ts";
import { handleInfractionCreate } from "../utils/infractions.ts";
import { EMBED_FIELD_CHAR_LIMIT } from "../utils/constants.ts";
import { ConfigManager } from "../utils/config.ts";
import { elipsify } from "../utils";

import Command from "../handlers/commands/Command.ts";

// Constants
const THIRTY_MINUTES = 1000 * 60 * 30;

export default class QuickMute30Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick Mute (30m)",
            type: ApplicationCommandType.Message
        });
    }

    execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        return handleQuickMute(interaction, THIRTY_MINUTES);
    }
}

// Reusable with different durations
export async function handleQuickMute(interaction: MessageContextMenuCommandInteraction<"cached">, duration: number): Promise<InteractionReplyData> {
    const config = ConfigManager.getGuildConfig(interaction.guildId, true);
    const { content, member } = interaction.targetMessage;

    if (!member) {
        return "You can't mute someone who isn't in the server";
    }

    if (member.roles.highest.position >= interaction.member.roles.highest.position) {
        return "You can't mute someone with the same or higher role than you";
    }

    if (member.isCommunicationDisabled()) {
        return "You can't mute someone who is already muted";
    }

    if (!content) {
        return "This action can't be performed on messages with no message content";
    }

    await member.timeout(THIRTY_MINUTES, content);

    const expiresTimestamp = Date.now() + duration;
    const expiresAt = new Date(expiresTimestamp);
    const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
    const reason = `QUICK MUTE BY ${interaction.user.id} - ${elipsify(content, EMBED_FIELD_CHAR_LIMIT)}`;

    const infraction = await handleInfractionCreate({
        executor_id: interaction.user.id,
        guild_id: interaction.guildId,
        action: Action.Mute,
        flag: Flag.Quick,
        target_id: member.id,
        expires_at: expiresAt,
        reason
    }, config);

    if (!infraction) {
        return "An error occurred while storing the infraction";
    }

    return `Successfully set ${member} on a timeout that will end \`${relativeTimestamp}\` - \`#${infraction.id}\` (\`${reason}\`)`;
}