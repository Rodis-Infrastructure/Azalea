import {
    ApplicationCommandType,
    GuildMember,
    Message,
    MessageContextMenuCommandInteraction,
    time,
    TimestampStyles
} from "discord.js";

import { Action, Flag, InteractionReplyData } from "@utils/types";
import { handleInfractionCreate } from "@utils/infractions";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { handlePurgeLog, purgeUser } from "./Purge";
import { elipsify } from "@/utils";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

// Constants
export const THIRTY_MINUTES = 1000 * 60 * 30;

export default class QuickMute30Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick Mute (30m)",
            type: ApplicationCommandType.Message
        });
    }

    execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        // Perform a 30-minute quick mute
        return handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: THIRTY_MINUTES
        });
    }
}

/**
 * Handles the quick mute commands
 *
 * @param data The quick mute data
 * @param data.executor The executor of the quick mute
 * @param data.targetMessage The message to mute the author of
 * @param data.duration The duration of the mute
 * @returns The interaction response
 */
export async function handleQuickMute(data: {
    executor: GuildMember,
    targetMessage: Message<true>,
    duration: number
}): Promise<string> {
    const { executor, targetMessage, duration } = data;
    const { content, member, channel } = targetMessage;

    // Check if the member is in the server
    // Users that are not in the server cannot be muted
    if (!member) {
        return "You can't mute someone who isn't in the server";
    }

    const config = ConfigManager.getGuildConfig(member.guild.id, true);

    // Compare roles to ensure the executor has permission to mute the target
    if (member.roles.highest.position >= executor.roles.highest.position) {
        return "You can't mute someone with the same or higher role than you";
    }

    // Check if the bot has permission to mute the member
    if (!member.manageable) {
        return "I do not have permission to mute this user";
    }

    // Check if the member is muted
    if (member.isCommunicationDisabled()) {
        return "You can't mute someone who is already muted";
    }

    // Check if the message has content
    // Empty content cannot be used as a reason
    if (!content) {
        return "This action can't be performed on messages with no message content";
    }

    // Mute the user
    await member.timeout(THIRTY_MINUTES, content);

    // Calculate the expiration date
    const expiresTimestamp = Date.now() + duration;
    const expiresAt = new Date(expiresTimestamp);

    const messages = await purgeUser(member.id, channel, config.data.default_purge_amount);
    const [logUrl] = await handlePurgeLog(messages, channel, config);

    // Format the expiration date as a relative timestamp
    const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
    let reason = `QUICK MUTE BY ${executor.id} - $MESSAGE_PREVIEW (Purge log: ${logUrl})`;

    // Replace the message preview placeholder with the actual message content
    // to account for the added character limit
    reason = reason.replace("$MESSAGE_PREVIEW", elipsify(content, EMBED_FIELD_CHAR_LIMIT - reason.length + 16));

    const infraction = await handleInfractionCreate({
        executor_id: executor.id,
        guild_id: member.guild.id,
        action: Action.Mute,
        flag: Flag.Quick,
        target_id: member.id,
        expires_at: expiresAt,
        reason
    }, config);

    if (!infraction) {
        return "An error occurred while storing the infraction";
    }

    // Ensure a public log of the action is made
    if (config.inScope(channel, config.data.ephemeral_scoping)) {
        config.sendNotification(`${executor} set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` (\`${reason}\`)`, false);
    }

    return `Successfully set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` (\`${reason}\`)`;
}