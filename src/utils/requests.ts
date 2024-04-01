import { Colors, EmbedBuilder, GuildMember, hyperlink, Message, messageLink, userMention } from "discord.js";
import { DEFAULT_MUTE_DURATION } from "./constants";
import { RequestValidationError } from "./errors";
import { Snowflake } from "discord-api-types/v10";
import { formatMessageContentForLog, temporaryReply } from "./messages";
import { userMentionWithId } from "@utils/index";
import { TypedRegEx } from "typed-regex";
import { client, prisma } from "./..";
import { log } from "@utils/logging";

import GuildConfig, { LoggingEvent, ModerationRequestType, Permission } from "@managers/config/GuildConfig";
import Sentry from "@sentry/node";
import ms from "ms";

export async function handleModerationRequest(message: Message<true>, config: GuildConfig): Promise<void> {
    const request = config.data.moderation_requests.find(request => request.channel_id === message.channel.id);
    if (!request) return;

    try {
        if (request.type === ModerationRequestType.Mute) {
            await validateMuteRequest(message, config);
        }

        if (request.type === ModerationRequestType.Ban) {
            const request = await validateBanRequest(message, config);

            if (!message.member) {
                await temporaryReply(message, "Failed to fetch author, unable to perform auto-mute.", config.data.response_ttl);
                return;
            }

            // TODO - Update reason on message update
            await handleAutomaticMute(message.member, request, config);
        }
    } catch (error) {
        if (error instanceof RequestValidationError) {
            await temporaryReply(message, error.message, config.data.response_ttl);
            return;
        }

        Sentry.captureException(error);
        await temporaryReply(message, "An unknown error has occurred while trying to handle the request.", config.data.response_ttl);
    }
}

/**
 * Handle the automatic mute of a ban request
 *
 * - Check if the request author has permission to manage mute requests.
 * - Check if the request target user is in the guild.
 * - Check whether the target user is already muted.
 *
 * @param requestAuthor - The request author.
 * @param request - The request.
 * @param config - The guild configuration.
 */
async function handleAutomaticMute(requestAuthor: GuildMember, request: RequestAutoMuteProps, config: GuildConfig): Promise<void> {
    // Check if the request author has permission to manage mute requests
    if (!config.hasPermission(requestAuthor, Permission.ManageMuteRequests)) {
        return;
    }

    // Only guild members can be muted
    if (!request.target) {
        throw new RequestValidationError("Failed to fetch target, unable to perform auto-mute.");
    }

    // Check if the target is already muted
    if (request.target.isCommunicationDisabled()) {
        return;
    }

    await request.target.timeout(DEFAULT_MUTE_DURATION, request.reason);
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
 */
async function validateMuteRequest(request: Message<true>, config: GuildConfig): Promise<void> {
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
    const regex = TypedRegEx("^(?:<@!?)?(?<targetId>\\d{17,19})>? +(?<duration>\\d+[mhd])?[\\n\\r\\s]+(?<reason>.+)", "gmi");
    const matches = regex.captures(request.content);

    // Validate the request format
    if (!matches) {
        throw new RequestValidationError("Invalid ban request format.");
    }

    // Check if the request is a duplicate
    const originalRequest = await prisma.request.findFirst({
        select: { id: true },
        where: {
            target_id: matches.targetId,
            punishment_type: ModerationRequestType.Mute,
            guild_id: config.guild.id,
            status: RequestStatus.Pending
        }
    });

    if (originalRequest) {
        const requestUrl = messageLink(request.channelId, originalRequest.id, request.guildId);
        throw new RequestValidationError(`A mute request for this user is already pending: ${requestUrl}`);
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

    const msDuration = matches.duration
        ? ms(matches.duration)
        : null;

    await prisma.request.create({
        data: {
            id: request.id,
            author_id: request.author.id,
            target_id: target.id,
            guild_id: config.guild.id,
            punishment_type: ModerationRequestType.Mute,
            reason: matches.reason,
            status: RequestStatus.Pending,
            duration: msDuration
        }
    });
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
 */
async function validateBanRequest(request: Message<true>, config: GuildConfig): Promise<RequestAutoMuteProps> {
    /**
     * Regex pattern for extracting the target ID and reason from the message content.
     * ## Examples
     *
     * - `<@!123456789012345678> Spamming`
     * - `<@123456789012345678> Spamming`
     * - `123456789012345678 Spamming`
     */
    const regex = TypedRegEx("^(?:<@!?)?(?<targetId>\\d{17,19})>? +(?<reason>.+)", "gmi");
    const matches = regex.captures(request.content);

    // Validate the request format
    if (!matches) {
        throw new RequestValidationError("Invalid ban request format.");
    }

    // Check if the request is a duplicate
    const originalRequest = await prisma.request.findFirst({
        select: { id: true },
        where: {
            target_id: matches.targetId,
            punishment_type: ModerationRequestType.Ban,
            guild_id: config.guild.id,
            status: RequestStatus.Pending
        }
    });

    if (originalRequest) {
        const requestUrl = messageLink(request.channelId, originalRequest.id, request.guildId);
        throw new RequestValidationError(`A ban request for this user is already pending: ${requestUrl}`);
    }

    const target = await config.guild.members
        .fetch(matches.targetId)
        .catch(() => null);

    // Verify permissions
    if (
        target &&
        request.member &&
        target.roles.highest.position >= request.member.roles.highest.position
    ) {
        throw new RequestValidationError("You cannot mute a member with a higher or equal role.");
    }

    await prisma.request.create({
        data: {
            id: request.id,
            author_id: request.author.id,
            target_id: matches.targetId,
            guild_id: config.guild.id,
            punishment_type: ModerationRequestType.Ban,
            reason: matches.reason,
            status: RequestStatus.Pending
        }
    });

    return {
        target,
        reason: matches.reason
    };
}

/**
 * Approve a moderation request.
 *
 * @param requestId - The message ID of the request.
 * @param reviewerId - The ID of the user approving the moderation request.
 * @param config - The guild configuration.
 */
export async function approveRequest(requestId: Snowflake, reviewerId: Snowflake, config: GuildConfig): Promise<void> {
    const request = await prisma.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.Approved },
        select: {
            id: true,
            punishment_type: true,
            target_id: true,
            duration: true,
            reason: true,
            guild_id: true,
            author_id: true
        }
    }).catch(() => null);

    if (!request) {
        config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, the request was not found.`);
        return;
    }

    const guild = await client.guilds.fetch(request.guild_id).catch(() => null);

    if (!guild) {
        config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, the guild was not found.`);
        return;
    }

    const handleModerationLog = (event: LoggingEvent, action: string): void => {
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Moderation Request Approved" })
            .setTitle(action)
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewerId) },
                { name: "Request Author", value: userMentionWithId(request.author_id) },
                { name: "Target", value: userMentionWithId(request.target_id) },
                { name: "Request Content", value: formatMessageContentForLog(request.reason) }
            ])
            .setTimestamp();

        log({
            event,
            config,
            channel: null,
            message: {
                embeds: [embed]
            }
        });
    };

    switch (request.punishment_type) {
        case ModerationRequestType.Mute: {
            const target = await guild.members.fetch(request.target_id).catch(() => null);

            if (!target) {
                config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, the offender may have left the guild.`);
                return;
            }

            await target.timeout(request.duration, request.reason);
            handleModerationLog(LoggingEvent.MuteRequestApprove, "Muted");
            break;
        }

        case ModerationRequestType.Ban: {
            const target = await client.users.fetch(request.target_id).catch(() => null);

            if (!target) {
                config.sendNotification(`${userMention(reviewerId)} Failed to approve the request, the offender was not found.`);
                return;
            }

            await guild.members.ban(target, { reason: request.reason });
            handleModerationLog(LoggingEvent.BanRequestApprove, "Banned");
            break;
        }
    }
}

/**
 * Deny a moderation request.
 *
 * @param message - The request message.
 * @param reviewerId - The ID of the user denying the moderation request.
 * @param config - The guild configuration.
 */
export async function denyRequest(message: Message<true>, reviewerId: Snowflake, config: GuildConfig): Promise<void> {
    const request = await prisma.request.update({
        where: { id: message.id },
        data: { status: RequestStatus.Denied },
        select: {
            id: true,
            author_id: true,
            guild_id: true,
            target_id: true,
            punishment_type: true
        }
    }).catch(() => null);

    const reviewerMention = userMention(reviewerId);

    if (!request) {
        config.sendNotification(`${reviewerMention} Failed to deny the request, the request was not found.`);
        return;
    }

    const targetMention = userMention(request.target_id);
    const requestLink = hyperlink("Your request", message.url);

    const handleModerationRequestDenyLog = (event: LoggingEvent, action: string): void => {
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Moderation Request Denied" })
            .setTitle(action)
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewerId) },
                { name: "Request Author", value: userMentionWithId(request.author_id) },
                { name: "Target", value: userMentionWithId(request.target_id) },
                { name: "Request Content", value: formatMessageContentForLog(message.content) }
            ])
            .setTimestamp();

        log({
            event,
            config,
            channel: null,
            message: {
                embeds: [embed]
            }
        });
    };

    config.sendNotification(`${message.author} ${requestLink} against ${targetMention} has been denied by ${reviewerMention}.`);

    switch (request.punishment_type) {
        case ModerationRequestType.Mute: {
            handleModerationRequestDenyLog(LoggingEvent.MuteRequestDeny, "Mute");
            break;
        }

        case ModerationRequestType.Ban: {
            handleModerationRequestDenyLog(LoggingEvent.BanRequestDeny, "Ban");
            break;
        }
    }
}

enum RequestStatus {
    Pending = "pending",
    Approved = "approved",
    Denied = "denied"
}

interface RequestAutoMuteProps {
    target: GuildMember | null;
    reason: string;
}