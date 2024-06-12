import {
    Colors,
    EmbedBuilder,
    GuildMember,
    hyperlink,
    Message,
    messageLink,
    userMention
} from "discord.js";

import { InfractionAction, InfractionManager, InfractionUtil } from "./infractions";
import { DEFAULT_MUTE_DURATION, EMBED_FIELD_CHAR_LIMIT, MAX_MUTE_DURATION } from "./constants";
import { RequestValidationError } from "./errors";
import { Snowflake } from "discord-api-types/v10";
import { temporaryReply } from "./messages";
import { userMentionWithId } from "./index";
import { TypedRegEx } from "typed-regex";
import { client, prisma } from "./..";
import { log } from "./logging";
import { Prisma } from "@prisma/client";
import { LoggingEvent, ModerationRequestType, Permission } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import StoreMediaCtx from "@/commands/StoreMediaCtx";
import Sentry from "@sentry/node";
import ms from "ms";
import Infraction from "@/commands/Infraction";
import { ValidationError } from "zod-validation-error";

export async function handleModerationRequest(message: Message<true>, config: GuildConfig): Promise<void> {
    const requestConfig = config.data.moderation_requests
        .find(requestConfig => requestConfig.channel_id === message.channel.id);

    if (!requestConfig) return;

    const validationResult = await InfractionUtil.validateReason(message.content, config);

    if (!validationResult.success) {
        await temporaryReply(message, validationResult.message, config.data.response_ttl);
        return;
    }

    try {
        let request: Prisma.ModerationRequestCreateInput | null = null;

        if (requestConfig.type === ModerationRequestType.Mute) {
            request = await validateMuteRequest(message, config);
        }

        if (requestConfig.type === ModerationRequestType.Ban) {
            const res = await validateBanRequest(message, config);
            const [targetMember, targetId] = res;

            request = res[2];

            // Don't attempt to auto-mute if the target user is already muted
            if (!targetMember?.isCommunicationDisabled() && !request.mute_id) {
                if (!message.member) {
                    await temporaryReply(message, "Failed to fetch author, unable to perform auto-mute.", config.data.response_ttl);
                    return;
                }

                request.mute_id = await handleAutomaticMute({
                    executor: message.member,
                    reason: request.reason,
                    target: targetMember,
                    targetId,
                    config
                });
            } else if (request.mute_id) {
                await Infraction.setReason({
                    infractionId: request.mute_id,
                    reason: request.reason,
                    executor: message.member!,
                    config
                });
            }
        }

        if (!request) return;

        // Append the media log URLs to the message content
        if (message.attachments.size) {
            const media = Array.from(message.attachments.values());
            const logURLs = await StoreMediaCtx.storeMedia(message.member, message.author.id, media, config);

            request.reason += ` ${logURLs.join(" ")}`;
        }

        if (request.reason.length > EMBED_FIELD_CHAR_LIMIT) {
            await temporaryReply(message, `The reason is too long, it must be under ${EMBED_FIELD_CHAR_LIMIT} characters.`, config.data.response_ttl);
            return;
        }

        // Store the request in the database if it doesn't exist
        // Update the reason if the request is already stored
        await prisma.moderationRequest.upsert({
            where: { id: message.id },
            create: request,
            update: {
                target_id: request.target_id,
                reason: request.reason,
                duration: request.duration
            }
        });
    } catch (error) {
        if (error instanceof RequestValidationError) {
            await temporaryReply(message, error.message, config.data.response_ttl);
            return;
        }

        Sentry.captureException(error);
        await temporaryReply(message, "An unknown error has occurred while trying to handle the request", config.data.response_ttl);
    }
}

/**
 * Handle the automatic mute of a ban request
 *
 * - Check if the request author has permission to manage mute requests.
 * - Check if the request target user is in the guild.
 * - Check whether the target user is already muted.
 *
 * @param data.executor - The request author.
 * @param data.target - The target member.
 * @param data.reason - The reason for the mute.
 * @param data.config - The guild configuration.
 * @returns The ID of the newly created infraction.
 */
async function handleAutomaticMute(data: {
    executor: GuildMember,
    target: GuildMember | null,
    targetId: Snowflake,
    reason: string,
    config: GuildConfig
}): Promise<number | null> {
    const { executor, target, reason, config, targetId } = data;

    // Check if the request author has permission to manage mute requests
    if (!config.hasPermission(executor, Permission.ManageMuteRequests)) {
        return null;
    }

    await target?.timeout(DEFAULT_MUTE_DURATION, reason).catch(() => null);

    // Store the infraction
    const infraction = await InfractionManager.storeInfraction({
        expires_at: new Date(Date.now() + DEFAULT_MUTE_DURATION),
        guild_id: config.guild.id,
        executor_id: executor.id,
        target_id: targetId,
        action: InfractionAction.Mute,
        reason
    });

    if (infraction) {
        InfractionManager.logInfraction(infraction, executor, config);
    } else {
        config.sendNotification(`${userMention(executor.id)} Failed to mute ${userMention(targetId)}, unable to schedule mute.`);
    }

    return infraction?.id ?? null;
}

/**
 * Perform validation on the mute request message.
 *
 * - Verify the request format.
 * - Ensure the target is in the guild.
 * - Ensure the target does not have a higher or equal role than the request author.
 * - Create a new moderation request in the database.
 *
 * @param request - The request.
 * @param config - The guild configuration.
 * @returns The target member and the request data: [targetMember, requestData]
 */
async function validateMuteRequest(request: Message<true>, config: GuildConfig): Promise<Prisma.ModerationRequestCreateInput> {
    /**
     * Regex pattern for extracting the target ID, duration, and reason from the message content.
     * ## Examples
     *
     * - `<@!123456789012345678> 1d Spamming`
     * - `<@123456789012345678> 1d Spamming`
     * - `123456789012345678 1d Spamming`
     * - `<@!123456789012345678> Spamming`
     * - `<@123456789012345678> Spamming`
     * - `123456789012345678 Spamming`
     */
    const regex = TypedRegEx("^(?:<@!?)?(?<targetId>\\d{17,19})>?(?: +(?<duration>\\d+[mhd]))? +(?<reason>([\\n\\r]|.)+)", "gmi");
    const matches = regex.captures(request.content);

    // Validate the request format
    if (!matches) {
        throw new RequestValidationError("Invalid mute request format.");
    }

    // Check if the request is a duplicate
    const originalRequest = await prisma.moderationRequest.findFirst({
        select: { id: true, author_id: true },
        where: {
            NOT: { id: request.id },
            target_id: matches.targetId,
            type: ModerationRequestType.Mute,
            guild_id: config.guild.id,
            status: RequestStatus.Pending
        }
    });

    if (originalRequest && !request.author.bot) {
        const requestURL = messageLink(request.channelId, originalRequest.id, request.guildId);
        await temporaryReply(request, `A mute request for this user is already pending: ${requestURL}`, config.data.response_ttl);
    }

    const target = await config.guild.members
        .fetch(matches.targetId)
        .catch(() => null);

    // Only guild members can be muted
    if (!target) {
        throw new RequestValidationError("Invalid target or the target has left the guild.");
    }

    // Verify permissions
    if (request.member && target.roles.highest.position >= request.member.roles.highest.position) {
        throw new RequestValidationError("You cannot mute a member with a higher or equal role.");
    }

    const maxMuteDurationSeconds = MAX_MUTE_DURATION / 1000;

    let duration = matches.duration
        ? ms(matches.duration) / 1000
        : maxMuteDurationSeconds;

    if (duration > maxMuteDurationSeconds) duration = maxMuteDurationSeconds;

    return {
        id: request.id,
        author_id: request.author.id,
        target_id: target.id,
        guild_id: config.guild.id,
        type: ModerationRequestType.Mute,
        reason: matches.reason,
        status: RequestStatus.Pending,
        duration: duration
    };
}

/**
 * Perform validation on the ban request message.
 *
 * - Verify the request format.
 * - Ensure the target does not have a higher or equal role than the request author.
 * - Create a new moderation request in the database.
 *
 * @param request - The request.
 * @param config - The guild configuration.
 * @returns The target member and the request data: [targetMember, targetId, requestData]
 */
async function validateBanRequest(request: Message<true>, config: GuildConfig): Promise<[GuildMember | null, Snowflake, Prisma.ModerationRequestCreateInput]> {
    /**
     * Regex pattern for extracting the target ID and reason from the message content.
     * ## Examples
     *
     * - `<@!123456789012345678> Spamming`
     * - `<@123456789012345678> Spamming`
     * - `123456789012345678 Spamming`
     */
    const regex = TypedRegEx("^(?:<@!?)?(?<targetId>\\d{17,19})>? +(?<reason>([\\n\\r]|.)+)", "gmi");
    const matches = regex.captures(request.content);

    // Validate the request format
    if (!matches) {
        throw new RequestValidationError("Invalid ban request format.");
    }

    // Check if the request is a duplicate
    const originalRequest = await prisma.moderationRequest.findFirst({
        select: { id: true, author_id: true },
        where: {
            NOT: { id: request.id },
            target_id: matches.targetId,
            type: ModerationRequestType.Ban,
            guild_id: config.guild.id,
            status: RequestStatus.Pending
        }
    });

    if (originalRequest && !request.author.bot) {
        const requestURL = messageLink(request.channelId, originalRequest.id, request.guildId);
        await temporaryReply(request, `A ban request for this user is already pending: ${requestURL}`, config.data.response_ttl);
    }

    const targetMember = await config.guild.members
        .fetch(matches.targetId)
        .catch(() => null);

    // Verify permissions
    if (
        targetMember &&
        request.member &&
        targetMember.roles.highest.position >= request.member.roles.highest.position
    ) {
        throw new RequestValidationError("You cannot mute a member with a higher or equal role.");
    }

    const isBanned = await config.guild.bans.fetch(matches.targetId)
        .then(() => true)
        .catch(() => false);

    if (isBanned) {
        throw new RequestValidationError("The target user is already banned.");
    }

    return [targetMember, matches.targetId, {
        id: request.id,
        author_id: request.author.id,
        target_id: matches.targetId,
        guild_id: config.guild.id,
        type: ModerationRequestType.Ban,
        reason: matches.reason,
        status: RequestStatus.Pending
    }];
}

/**
 * Approve a moderation request.
 *
 * @param request - The request message.
 * @param reviewerId - The ID of the user approving the moderation request.
 * @param config - The guild configuration.
 */
export async function approveModerationRequest(request: Message<true>, reviewerId: Snowflake, config: GuildConfig): Promise<void> {
    let data: Prisma.ModerationRequestCreateInput;

    try {
        data = await validateMuteRequest(request, config);
    } catch (error) {
        if (error instanceof ValidationError) {
            temporaryReply(request, error.message, config.data.response_ttl);
        } else {
            Sentry.captureException(error);
            temporaryReply(request, "An unknown error has occurred while trying to approve the request", config.data.response_ttl);
        }

        return;
    }

    const reviewer = await config.guild.members.fetch(reviewerId)
        .catch(() => null);

    const requestAuthor = await config.guild.members.fetch(data.author_id)
        .catch(() => null);

    const handleModerationRequestApproveLog = (event: LoggingEvent, action: string): void => {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Moderation Request Approved" })
            .setTitle(action)
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewerId) },
                { name: "Request Author", value: userMentionWithId(data.author_id) },
                { name: "Target", value: userMentionWithId(data.target_id) },
                { name: "Request Content", value: data.reason }
            ])
            .setTimestamp();

        log({
            event,
            config,
            channel: null,
            member: requestAuthor,
            message: {
                embeds: [embed]
            }
        });
    };

    switch (data.type) {
        case ModerationRequestType.Mute: {
            if (!reviewer || !config.hasPermission(reviewer, Permission.ManageMuteRequests)) {
                config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, you do not have permission to manage mute requests.`);
                return;
            }

            const target = await config.guild.members.fetch(data.target_id).catch(() => null);
            await target?.timeout(data.duration || null, data.reason).catch(() => null);

            handleModerationRequestApproveLog(LoggingEvent.MuteRequestApprove, "Muted");
            break;
        }

        case ModerationRequestType.Ban: {
            if (!reviewer || !config.hasPermission(reviewer, Permission.ManageBanRequests)) {
                config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, you do not have permission to manage ban requests.`);
                return;
            }

            const target = await client.users.fetch(data.target_id).catch(() => null);

            if (!target) {
                config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, the offender was not found.`);
                return;
            }

            await config.guild.members.ban(target, {
                reason: data.reason,
                deleteMessageSeconds: config.data.delete_message_seconds_on_ban
            });

            handleModerationRequestApproveLog(LoggingEvent.BanRequestApprove, "Banned");
            break;
        }
    }

    const action = data.type === ModerationRequestType.Mute
        ? InfractionAction.Mute
        : InfractionAction.Ban;

    const expiresAt = data.duration
        ? new Date(Date.now() + (data.duration * 1000))
        : null;

    const formattedReason = InfractionUtil.formatReason(data.reason);

    config.sendNotification(
        `${userMention(data.author_id)}'s ${data.type} request against ${userMention(data.target_id)} has been approved by ${userMention(reviewerId)} ${formattedReason}`,
        false
    );

    await prisma.moderationRequest.upsert({
        where: { id: request.id },
        create: {
            ...data,
            status: RequestStatus.Approved
        },
        update: {
            status: RequestStatus.Approved,
            target_id: data.target_id,
            reason: data.reason,
            duration: data.duration
        }
    });

    const infraction = await InfractionManager.storeInfraction({
        expires_at: expiresAt,
        guild_id: data.guild_id,
        executor_id: reviewerId,
        request_author_id: data.author_id,
        target_id: data.target_id,
        reason: data.reason,
        action
    });

    if (infraction) {
        InfractionManager.logInfraction(infraction, reviewer, config);
    } else if (data.type === ModerationRequestType.Mute) {
        config.sendNotification(`${userMention(reviewerId)} Failed to mute the user, unable to schedule mute.`);
    }
}

/**
 * Deny a moderation request.
 *
 * @param messageId - The request message.
 * @param reviewerId - The ID of the user denying the moderation request.
 * @param config - The guild configuration.
 */
export async function denyModerationRequest(messageId: Snowflake, reviewerId: Snowflake, config: GuildConfig): Promise<void> {
    const request = await prisma.moderationRequest.update({
        where: { id: messageId },
        data: { status: RequestStatus.Denied },
        select: {
            id: true,
            author_id: true,
            guild_id: true,
            target_id: true,
            reason: true,
            type: true
        }
    }).catch(() => null);

    const reviewerMention = userMention(reviewerId);

    if (!request) {
        config.sendNotification(`${reviewerMention} Failed to deny the request, the request was not found.`);
        return;
    }

    const targetMention = userMention(request.target_id);
    const channelId = config.data.moderation_requests
        .find(requestConfig => requestConfig.type === request.type)!.channel_id;

    const url = messageLink(channelId, messageId, config.guild.id);
    const requestLink = hyperlink("Your request", url);

    const handleModerationRequestDenyLog = async (event: LoggingEvent, action: string): Promise<void> => {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Moderation Request Denied" })
            .setTitle(action)
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewerId) },
                { name: "Request Author", value: userMentionWithId(request.author_id) },
                { name: "Target", value: userMentionWithId(request.target_id) },
                { name: "Request Content", value: request.reason }
            ])
            .setTimestamp();

        const requestAuthor = await config.guild.members.fetch(request.author_id)
            .catch(() => null);

        log({
            event,
            config,
            channel: null,
            member: requestAuthor,
            message: {
                embeds: [embed]
            }
        });
    };

    const reviewer = await config.guild.members
        .fetch(reviewerId)
        .catch(() => null);

    switch (request.type) {
        case ModerationRequestType.Mute: {
            if (!reviewer || !config.hasPermission(reviewer, Permission.ManageMuteRequests)) {
                config.sendNotification(`${reviewerMention} Failed to deny the request, you do not have permission to manage mute requests.`);
                return;
            }

            handleModerationRequestDenyLog(LoggingEvent.MuteRequestDeny, "Mute");
            break;
        }

        case ModerationRequestType.Ban: {
            if (!reviewer || !config.hasPermission(reviewer, Permission.ManageBanRequests)) {
                config.sendNotification(`${reviewerMention} Failed to deny the request, you do not have permission to manage ban requests.`);
                return;
            }

            try {
                const target = await config.guild.members.fetch(request.target_id).catch(() => null);
                await target?.timeout(null).catch(() => null);

                await InfractionManager.endActiveMutes(config.guild.id, request.target_id);
            } catch {
                config.sendNotification(`${reviewerMention} Failed to unmute ${targetMention} on ban request denial, unable to schedule unmute.`);
            }

            handleModerationRequestDenyLog(LoggingEvent.BanRequestDeny, "Ban");
            break;
        }
    }

    // The reviewer cannot be null at this point due to the permission checks
    const reviewerName = reviewer!.nickname ?? reviewer!.displayName;
    config.sendNotification(`${userMention(request.author_id)} ${requestLink} against ${targetMention} has been denied by \`${reviewerName}\`.`);
}

export enum RequestStatus {
    Pending = "pending",
    Approved = "approved",
    Denied = "denied",
    Deleted = "deleted",
    Unknown = "unknown"
}