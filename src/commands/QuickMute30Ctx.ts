import {
    ApplicationCommandType,
    GuildMember,
    Message,
    MessageContextMenuCommandInteraction,
    time,
    TimestampStyles
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { Action, Flag, getActiveMute, handleInfractionCreate, MuteDuration } from "@utils/infractions";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { cropLines, elipsify, formatInfractionReason } from "@/utils";
import { prisma } from "./..";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Purge from "./Purge";
import Sentry from "@sentry/node";

export default class QuickMute30Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick mute (30m)",
            type: ApplicationCommandType.Message
        });
    }

    execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        // Perform a 30-minute quick mute
        return handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: MuteDuration.Short
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
 * @param mention Whether to mention the target in the response
 * @returns The interaction response
 */
export async function handleQuickMute(data: {
    executor: GuildMember,
    targetMessage: Message<true>,
    duration: MuteDuration
}, mention = false): Promise<string> {
    const { executor, targetMessage, duration } = data;
    const { content, member, channel } = targetMessage;

    const config = ConfigManager.getGuildConfig(targetMessage.guildId, true);

    if (member) {
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
    } else {
        const mute = await getActiveMute(targetMessage.author.id, targetMessage.guildId);

        if (mute) {
            return "You can't mute someone who is already muted";
        }
    }

    // Check if the message has content
    // Empty content cannot be used as a reason
    if (!content) {
        return "This action can't be performed on messages with no message content";
    }


    // Calculate the expiration date
    const expiresTimestamp = Date.now() + duration;
    const expiresAt = new Date(expiresTimestamp);

    let reason = cropLines(content, 5);
    const messages = await Purge.purgeUser(targetMessage.author.id, channel, config.data.default_purge_amount);

    // Only append the purge logs if messages were purged
    if (messages.length) {
        const [logUrl] = await Purge.log(messages, channel, config);
        reason += ` (Purge log: ${logUrl})`;
    }

    const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
    reason = elipsify(reason, EMBED_FIELD_CHAR_LIMIT);

    const infraction = await handleInfractionCreate({
        executor_id: executor.id,
        guild_id: targetMessage.guildId,
        action: Action.Mute,
        flag: Flag.Quick,
        target_id: targetMessage.author.id,
        expires_at: expiresAt,
        reason
    }, config);

    if (!infraction) {
        return "An error occurred while storing the infraction";
    }

    if (member) {
        try {
            // Quick mute the user
            await member.timeout(duration, reason);
        } catch (error) {
            const sentryId = Sentry.captureException(error);

            // If the quick mute fails, rollback the infraction
            await prisma.infraction.delete({ where: { id: infraction.id } });
            return `An error occurred while quick muting the member (\`${sentryId}\`)`;
        }
    }

    const formattedReason = formatInfractionReason(reason);

    // Ensure a public log of the action is made if executed ephemerally
    if (config.inScope(channel, config.data.ephemeral_scoping)) {
        config.sendNotification(
            `${executor} set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`,
            mention
        );
    }

    if (member) {
        return `Successfully set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`;
    } else {
        return `Successfully stored the infraction (\`#${infraction.id}\`) but failed to quick mute the user as they are not in the server, I will try to mute them if they join back.`;
    }
}