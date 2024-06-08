import {
    ApplicationCommandType,
    GuildMember,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    MessageContextMenuCommandInteraction,
    Snowflake,
    time,
    TimestampStyles,
    userMention
} from "discord.js";

import {
    InfractionAction,
    InfractionFlag,
    InfractionManager,
    InfractionUtil,
    QuickMuteDuration
} from "@utils/infractions";

import { InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { cropLines, elipsify } from "@/utils";
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
        const { message } = await handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: QuickMuteDuration.Short
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
    duration: QuickMuteDuration
}, mention = false): Promise<QuickMuteResult> {
    const { executor, targetMessage, duration } = data;

    if (!targetMessage.content) {
        return {
            message: "This action can't be performed on messages with no message content.",
            success: false
        };
    }

    let channel: GuildTextBasedChannel | null;
    let targetMember: GuildMember | null;
    let targetUserId: Snowflake;
    let content: string;

    if (targetMessage instanceof DiscordMessage) {
        targetMember = targetMessage.member;
        channel = targetMessage.channel as GuildTextBasedChannel;
        targetUserId = targetMessage.author.id;
        content = targetMessage.cleanContent;
    } else {
        targetMember = await executor.guild.members.fetch(targetMessage.author_id).catch(() => null);
        channel = await executor.guild.channels.fetch(targetMessage.channel_id).catch(() => null) as GuildTextBasedChannel | null;
        targetUserId = targetMessage.author_id;
        content = targetMessage.content;
    }

    if (!channel) {
        return {
            message: "Failed to fetch the source channel. Unable to perform quick mute",
            success: false
        };
    }

    const config = ConfigManager.getGuildConfig(executor.guild.id, true);

    if (targetMember) {
        if (targetMember.roles.highest.position >= executor.roles.highest.position) {
            return {
                message: "You can't mute someone with the same or higher role than you",
                success: false
            };
        }

        if (!targetMember.manageable) {
            return {
                message: "I do not have permission to mute this user",
                success: false
            };
        }

        if (targetMember.isCommunicationDisabled()) {
            return {
                message: "You can't mute someone who is already muted",
                success: false
            };
        }
    } else {
        const isMuted = await InfractionManager.getActiveMute(targetUserId, executor.guild.id);

        if (isMuted) {
            return {
                message: "You can't mute someone who is already muted",
                success: false
            };
        }
    }

    const msExpiresAt = Date.now() + duration;
    const expiresAt = new Date(msExpiresAt);
    const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
    const purgedMessages = await Purge.purgeUser(targetUserId, channel, config.data.default_purge_amount);
    let reason = cropLines(content, 5);

    if (purgedMessages.length) {
        const [logURL] = await Purge.log(purgedMessages, channel, config);
        reason += ` (Purge log: ${logURL})`;
    }

    reason = elipsify(reason, EMBED_FIELD_CHAR_LIMIT);

    const infraction = await InfractionManager.storeInfraction({
        executor_id: executor.id,
        guild_id: executor.guild.id,
        action: InfractionAction.Mute,
        flag: InfractionFlag.Quick,
        target_id: targetUserId,
        expires_at: expiresAt,
        reason
    });

    if (!infraction) {
        return {
            message: "An error occurred while storing the infraction",
            success: false
        };
    }

    if (targetMember) {
        try {
            await targetMember.timeout(duration, reason);
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            InfractionManager.deleteInfraction(infraction.id);

            return {
                message: `An error occurred while quick muting the member (\`${sentryId}\`)`,
                success: false
            };
        }
    }

    InfractionManager.logInfraction(infraction, config);

    const formattedReason = InfractionUtil.formatReason(reason);
    const message = `set ${userMention(targetUserId)} on a timeout that will end ${relativeTimestamp} - \`#${infraction.id}\` ${formattedReason}`;

    if (config.inScope(channel, config.data.ephemeral_scoping)) {
        config.sendNotification(`${executor} ${message}`, mention);
    }

    if (targetMember) {
        return {
            message: `Successfully ${message}`,
            success: true
        };
    } else {
        return {
            message: `User not in server, I will try to ${message.replace("-", "if they join -")}`,
            success: true
        };
    }
}

interface QuickMuteResult {
    message: string;
    success: boolean;
}