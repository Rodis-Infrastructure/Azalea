import {
    ApplicationCommandType,
    GuildMember,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    MessageContextMenuCommandInteraction,
    Snowflake,
    time,
    TimestampStyles
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { Action, Flag, getActiveMute, handleInfractionCreate, MuteDuration } from "@utils/infractions";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { cropLines, elipsify, formatInfractionReason } from "@/utils";
import { prisma } from "./..";
import { Message } from "@prisma/client";

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

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        // Perform a 30-minute quick mute
        const { message } = await handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: MuteDuration.Short
        });

        return message;
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
    targetMessage: DiscordMessage<true> | Message,
    duration: MuteDuration
}, mention = false): Promise<QuickMuteResult> {
    const { executor, targetMessage, duration } = data;

    if (!targetMessage.content) {
        return {
            message: "This action can't be performed on messages with no message content.",
            success: false
        };
    }

    let member: GuildMember | null;
    let channel: GuildTextBasedChannel | null;
    let authorId: Snowflake;

    if (targetMessage instanceof DiscordMessage) {
        member = targetMessage.member;
        channel = targetMessage.channel as GuildTextBasedChannel;
        authorId = targetMessage.author.id;
    } else {
        member = await executor.guild.members.fetch(targetMessage.author_id).catch(() => null);
        channel = await executor.guild.channels.fetch(targetMessage.channel_id).catch(() => null) as GuildTextBasedChannel | null;
        authorId = targetMessage.author_id;
    }

    if (!channel) {
        return {
            message: "Failed to fetch the source channel. Unable to perform quick mute",
            success: false
        };
    }

    const config = ConfigManager.getGuildConfig(executor.guild.id, true);

    if (member) {
        // Compare roles to ensure the executor has permission to mute the target
        if (member.roles.highest.position >= executor.roles.highest.position) {
            return {
                message: "You can't mute someone with the same or higher role than you",
                success: false
            };
        }

        // Check if the bot has permission to mute the member
        if (!member.manageable) {
            return {
                message: "I do not have permission to mute this user",
                success: false
            };
        }

        // Check if the member is muted
        if (member.isCommunicationDisabled()) {
            return {
                message: "You can't mute someone who is already muted",
                success: false
            };
        }
    } else {
        const mute = await getActiveMute(authorId, executor.guild.id);

        if (mute) {
            return {
                message: "You can't mute someone who is already muted",
                success: false
            };
        }
    }

    // Calculate the expiration date
    const expiresTimestamp = Date.now() + duration;
    const expiresAt = new Date(expiresTimestamp);

    let reason = cropLines(targetMessage.content, 5);
    const messages = await Purge.purgeUser(authorId, channel, config.data.default_purge_amount);

    // Only append the purge logs if messages were purged
    if (messages.length) {
        const [logUrl] = await Purge.log(messages, channel, config);
        reason += ` (Purge log: ${logUrl})`;
    }

    const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
    reason = elipsify(reason, EMBED_FIELD_CHAR_LIMIT);

    const infraction = await handleInfractionCreate({
        executor_id: executor.id,
        guild_id: executor.guild.id,
        action: Action.Mute,
        flag: Flag.Quick,
        target_id: authorId,
        expires_at: expiresAt,
        reason
    }, config);

    if (!infraction) {
        return {
            message: "An error occurred while storing the infraction",
            success: false
        };
    }

    if (member) {
        try {
            // Quick mute the user
            await member.timeout(duration, reason);
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            // If the quick mute fails, rollback the infraction
            await prisma.infraction.delete({ where: { id: infraction.id } });

            return {
                message: `An error occurred while quick muting the member (\`${sentryId}\`)`,
                success: false
            };
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
        return {
            message: `Successfully set ${member} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`,
            success: true
        };
    } else {
        return {
            message: `User not in server, I will set ${member} on a timeout that will end ${relativeTimestamp} if they rejoin - \`#${infraction.id}\` ${formattedReason}`,
            success: true
        };
    }
}

interface QuickMuteResult {
    message: string;
    success: boolean;
}