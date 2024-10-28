import { Colors, EmbedBuilder, GuildMember, hyperlink, Message, messageLink, Snowflake, userMention } from "discord.js";
import { Result } from "./types";
import { MuteRequest, Prisma } from "@prisma/client";
import { TypedRegEx } from "typed-regex";
import { client, prisma } from "./..";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { removeClientReactions, temporaryReply } from "./messages";
import { InfractionAction, InfractionManager, InfractionUtil } from "./infractions";
import { userMentionWithId } from "./index";
import { log } from "./logging";
import { captureException } from "@sentry/node";

import GuildConfig from "@managers/config/GuildConfig";
import StoreMediaCtx from "@/commands/StoreMediaCtx";
import ms from "ms";

export default class MuteRequestUtil {
    /**
     * Create or update a mute request.
     * See {@link MuteRequestUtil._validate} for validation details.
     *
     * @param request - The request message.
     * @param config - The guild configuration.
     */
    static async upsert(request: Message<true>, config: GuildConfig): Promise<void> {
        const validationResult = await MuteRequestUtil._validate(request, config);

        if (!validationResult.success) {
            await temporaryReply(request, validationResult.message, config.data.response_ttl);
            await request.react("⚠️");
            return;
        }

        const { data } = validationResult.data;
        removeClientReactions(request);

        await prisma.muteRequest.upsert({
            where: { id: request.id },
            create: data,
            update: {
                target_id: data.target_id,
                reason: data.reason,
                duration: data.duration
            }
        });
    }

    /**
     * Update the status of a mute request in the database.
     *
     * @param requestId - The request's message ID.
     * @param status - The new status.
     * @param reviewerId - The reviewer's user ID.
     */
    static async setStatus(requestId: Snowflake, status: MuteRequestStatus, reviewerId: Snowflake | null): Promise<MuteRequest | null> {
        try {
            return await prisma.muteRequest.update({
                where: { id: requestId },
                data: { status, reviewer_id: reviewerId }
            });
        } catch {
            return null;
        }
    }

    /**
     * Perform validation on the mute request message. The following conditions must be met:
     *
     * - Valid request format.
     * - Target user exists.
     * - Target user is not banned.
     * - Target user is not already muted.
     * - Target user does not have a higher or equal role than the request author.
     * - A request for the same user is not already pending.
     * - The reason is valid. See {@link InfractionUtil.validateReason} for details.
     *
     * @param request - The request.
     * @param config - The guild configuration.
     * @returns The target member and request data if the validation is successful. Otherwise, an error message.
     */
    private static async _validate(request: Message<true>, config: GuildConfig): Promise<Result<MuteValidationResult>> {
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
        const re = TypedRegEx("^(?:<@!?)?(?<targetId>\\d{17,19})>?(?: +(?<duration>\\d+[mhd]))? +(?<reason>(?:[\\n\\r]|.)+)", "mi");
        const args = re.captures(request.content);

        // Validate the request format
        if (!args) {
            return {
                success: false,
                message: "Invalid mute request format."
            };
        }

        // Append the media log URLs to the message content
        if (request.attachments.size) {
            const media = Array.from(request.attachments.values());
            const result = await StoreMediaCtx.storeMedia(request.member, request.author.id, media, config);

            if (result.success) {
                args.reason += ` ${result.data.join(" ")}`;
            }
        }

        const reasonValidationResult = await InfractionUtil.validateReason(args.reason, config);

        // The infraction reason must be valid
        if (!reasonValidationResult.success) {
            return reasonValidationResult;
        }

        const targetMember = await config.guild.members
            .fetch(args.targetId)
            .catch(() => null);

        const target = targetMember?.user ?? await client.users
            .fetch(args.targetId)
            .catch(() => null);

        // The target user must exist
        if (!target) {
            return {
                success: false,
                message: "Invalid user."
            };
        }

        const isBanned = await config.guild.bans.fetch(args.targetId)
            .then(() => true)
            .catch(() => false);

        // The target user must not be banned
        if (isBanned) {
            return {
                success: false,
                message: "You cannot request a mute for a banned user."
            };
        }

        // Verify role hierarchy
        if (
            request.member &&
            targetMember &&
            targetMember.roles.highest.position >= request.member.roles.highest.position
        ) {
            return {
                success: false,
                message: "You cannot mute a member with a higher or equal role."
            };
        }

        const isMuted = await InfractionManager.getActiveMute(args.targetId, config.guild.id)
            .then(mute => mute !== null);

        if (isMuted) {
            // Notify the request author instead of rejecting the request
            // since the request author may want to override an active mute
            await temporaryReply(request, "The user is already muted. Ignore this reply if you intend to override the active mute.", config.data.response_ttl);
        }

        // Check whether a request for the same user is already pending
        // Ignore duplicate requests from bots
        if (!request.author.bot) {
            const originalRequest = await prisma.muteRequest.findFirst({
                select: { id: true },
                where: {
                    NOT: { id: request.id },
                    target_id: args.targetId,
                    guild_id: config.guild.id,
                    status: MuteRequestStatus.Pending
                }
            });

            if (originalRequest) {
                const requestURL = messageLink(request.channelId, originalRequest.id, request.guildId);

                // Notify the request author instead of rejecting the request
                // since the duplication may be intentional
                await temporaryReply(request, `A mute request for this user is already pending: ${requestURL}`, config.data.response_ttl);
            }
        }

        // Ensure the passed duration does not exceed the maximum mute duration
        // Use the default mute duration if no duration is provided
        const durationSeconds = args.duration
            ? Math.min(ms(args.duration) / 1000, config.data.default_mute_duration_seconds)
            : config.data.default_mute_duration_seconds;

        return {
            success: true,
            data: {
                targetMember,
                data: {
                    id: request.id,
                    author_id: request.author.id,
                    target_id: target.id,
                    guild_id: config.guild.id,
                    reason: args.reason,
                    status: MuteRequestStatus.Pending,
                    duration: durationSeconds
                }
            }
        };
    }

    /**
     * Approve a mute request by:
     *
     * - Logging the approval.
     * - Storing the infraction in the database.
     * - Muting the target user.
     *
     * @param request - The request message.
     * @param reviewer - The user approving the request.
     * @param config - The guild configuration.
     */
    static async approve(request: Message<true>, reviewer: GuildMember, config: GuildConfig): Promise<void> {
        // Verify permissions
        if (!config.hasPermission(reviewer, Permission.ManageMuteRequests)) {
            config.sendNotification(`${reviewer} You do not have permission to manage mute requests.`);
            return;
        }

        const validationResult = await MuteRequestUtil._validate(request, config);

        if (!validationResult.success) {
            config.sendNotification(`${reviewer} Failed to approve the mute request, ${validationResult.message}`);
            return;
        }

        const { targetMember, data } = validationResult.data;
        const isMuted = await InfractionManager.getActiveMute(data.target_id, config.guild.id);

        if (isMuted) {
            config.sendNotification(`${reviewer} Failed to approve the mute request, the target is already muted, please unmute them before approving the request.`);
            return;
        }

        // Log the approval
        const muteRequestApproveEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Mute Request Approved" })
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewer.id) },
                { name: "Request Author", value: userMentionWithId(data.author_id) },
                { name: "Target", value: userMentionWithId(data.target_id) },
                { name: "Request Content", value: data.reason }
            ])
            .setTimestamp();

        log({
            event: LoggingEvent.MuteRequestApprove,
            member: request.member,
            channel: null,
            config,
            message: {
                embeds: [muteRequestApproveEmbed]
            }
        });

        // Store the mute request if it doesn't exist
        // Update the reviewer and status if it does
        await prisma.muteRequest.upsert({
            where: { id: request.id },
            create: {
                ...data,
                reviewer_id: reviewer.id,
                status: MuteRequestStatus.Approved
            },
            update: {
                status: MuteRequestStatus.Approved,
                reviewer_id: reviewer.id,
                target_id: data.target_id,
                reason: data.reason,
                duration: data.duration
            }
        });

        const expiresAt = new Date(Date.now() + (data.duration * 1000));
        const infraction = await InfractionManager.storeInfraction({
            expires_at: expiresAt,
            guild_id: data.guild_id,
            executor_id: reviewer.id,
            request_author_id: data.author_id,
            target_id: data.target_id,
            reason: data.reason,
            action: InfractionAction.Mute
        });

        // Try to mute the user
        // if it fails, delete the infraction and notify the reviewer
        try {
            await targetMember?.timeout(data.duration * 1000, data.reason);
        } catch (error) {
            const sentryId = captureException(error);

            InfractionManager.deleteInfraction(infraction.id);
            config.sendNotification(`${reviewer} An error occurred while muting the member (\`${sentryId}\`)`);
            return;
        }

        removeClientReactions(request);
        InfractionManager.logInfraction(infraction, reviewer, config);

        const formattedReason = InfractionUtil.formatReason(data.reason);

        config.sendNotification(
            `${userMention(data.author_id)}'s mute request against ${userMention(data.target_id)} has been approved by ${reviewer} - \`#${infraction.id}\` ${formattedReason}`,
            false
        );
    }

    /**
     * Deny a mute request by:
     *
     * - Logging the denial.
     * - Notifying the request author.
     *
     * @param request - The request message.
     * @param reviewer - The user denying the request.
     * @param config - The guild configuration.
     */
    static async deny(request: Message<true>, reviewer: GuildMember, config: GuildConfig): Promise<void> {
        // Verify permissions
        if (!config.hasPermission(reviewer, Permission.ManageMuteRequests)) {
            config.sendNotification(`${reviewer} You do not have permission to manage mute requests.`);
            return;
        }

        const requestData = await MuteRequestUtil.setStatus(request.id, MuteRequestStatus.Denied, reviewer.id);

        if (!requestData) {
            config.sendNotification(`${reviewer} Failed to deny the request, the request was not found.`);
            return;
        }

        // Log the denial
        const muteRequestDenyEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Mute Request Denied" })
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewer.id) },
                { name: "Request Author", value: userMentionWithId(requestData.author_id) },
                { name: "Target", value: userMentionWithId(requestData.target_id) },
                { name: "Request Content", value: requestData.reason }
            ])
            .setTimestamp();

        log({
            event: LoggingEvent.MuteRequestDeny,
            member: request.member,
            channel: null,
            config,
            message: {
                embeds: [muteRequestDenyEmbed]
            }
        });

        const targetMention = userMention(requestData.target_id);
        const requestHyperlink = hyperlink("Your mute request", request.url);

        removeClientReactions(request);
        config.sendNotification(`${request.author} ${requestHyperlink} against ${targetMention} has been denied by \`${reviewer.displayName}\`.`);
    }
}

interface MuteValidationResult {
    targetMember: GuildMember | null;
    data: Prisma.MuteRequestCreateInput;
}

export enum MuteRequestStatus {
    /** The request is pending review. */
    Pending = 1,
    /** The request has been approved and the user has been muted, or a mute has been scheduled. */
    Approved = 2,
    /** The request has been denied. */
    Denied = 3,
    /** The request has been deleted. */
    Deleted = 4,
    /** An unsupported reaction has been added to the request. */
    Unknown = 5
}