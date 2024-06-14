import { Colors, EmbedBuilder, GuildMember, hyperlink, Message, messageLink, Snowflake, userMention } from "discord.js";
import { Result } from "./types";
import { MuteRequest, Prisma } from "@prisma/client";
import { TypedRegEx } from "typed-regex";
import { client, prisma } from "./..";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { temporaryReply } from "./messages";
import { InfractionAction, InfractionManager, InfractionUtil } from "./infractions";
import { userMentionWithId } from "./index";
import { log } from "./logging";

import GuildConfig from "@managers/config/GuildConfig";
import StoreMediaCtx from "@/commands/StoreMediaCtx";
import ms from "ms";

export default class MuteRequestUtil {
    static async upsert(request: Message<true>, config: GuildConfig): Promise<void> {
        const validationResult = await MuteRequestUtil._validate(request, config);

        if (!validationResult.success) {
            await temporaryReply(request, validationResult.message, config.data.response_ttl);
            await request.react("⚠️");
            return;
        }

        const { data } = validationResult.data;

        // Remove the bot's reaction
        await request.reactions.cache.find(r => r.me)?.remove();

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

    static async setStatus(requestId: Snowflake, status: MuteRequestStatus): Promise<MuteRequest | null> {
        try {
            return await prisma.muteRequest.update({
                where: { id: requestId },
                data: { status }
            });
        } catch {
            return null;
        }
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

        if (!reasonValidationResult.success) {
            return reasonValidationResult;
        }

        // Check if the request is a duplicate
        const originalRequest = await prisma.muteRequest.findFirst({
            select: { id: true },
            where: {
                NOT: { id: request.id },
                target_id: args.targetId,
                guild_id: config.guild.id,
                status: MuteRequestStatus.Pending
            }
        });

        // Ignore duplicate requests from bots
        if (originalRequest && !request.author.bot) {
            const requestURL = messageLink(request.channelId, originalRequest.id, request.guildId);
            await temporaryReply(request, `A mute request for this user is already pending: ${requestURL}`, config.data.response_ttl);
        }

        const targetMember = await config.guild.members
            .fetch(args.targetId)
            .catch(() => null);

        const target = targetMember?.user ?? await client.users
            .fetch(args.targetId)
            .catch(() => null);

        if (!target) {
            return {
                success: false,
                message: "Invalid user."
            };
        }

        // Verify permissions
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
     * Approve a mute request.
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

        if (targetMember?.isCommunicationDisabled()) {
            config.sendNotification(`${reviewer} Failed to approve the mute request, the target is already muted, please unmute them before approving the request.`);
            return;
        }

        await targetMember?.timeout(data.duration * 1000, data.reason)
            .catch(() => null);

        // Log the approval
        const embed = new EmbedBuilder()
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
                embeds: [embed]
            }
        });

        const expiresAt = new Date(Date.now() + (data.duration * 1000));
        const formattedReason = InfractionUtil.formatReason(data.reason);

        config.sendNotification(
            `${userMention(data.author_id)}'s mute request against ${userMention(data.target_id)} has been approved by ${reviewer} ${formattedReason}`,
            false
        );

        await prisma.muteRequest.upsert({
            where: { id: request.id },
            create: {
                ...data,
                status: MuteRequestStatus.Approved
            },
            update: {
                status: MuteRequestStatus.Approved,
                target_id: data.target_id,
                reason: data.reason,
                duration: data.duration
            }
        });

        const infraction = await InfractionManager.storeInfraction({
            expires_at: expiresAt,
            guild_id: data.guild_id,
            executor_id: reviewer.id,
            request_author_id: data.author_id,
            target_id: data.target_id,
            reason: data.reason,
            action: InfractionAction.Mute
        });

        if (infraction) {
            InfractionManager.logInfraction(infraction, reviewer, config);
        } else if (!targetMember) {
            config.sendNotification(`${reviewer} Failed to mute the user, unable to schedule mute.`);
        }
    }

    /**
     * Deny a mute request.
     *
     * @param requestId - The request message.
     * @param reviewer - The user denying the request.
     * @param config - The guild configuration.
     */
    static async deny(requestId: Snowflake, reviewer: GuildMember, config: GuildConfig): Promise<void> {
        if (!config.hasPermission(reviewer, Permission.ManageMuteRequests)) {
            config.sendNotification(`${reviewer} You do not have permission to manage mute requests.`);
            return;
        }

        const request = await MuteRequestUtil.setStatus(requestId, MuteRequestStatus.Denied);

        if (!request) {
            config.sendNotification(`${reviewer} Failed to deny the request, the request was not found.`);
            return;
        }

        const targetMention = userMention(request.target_id);
        const requestChannelId = config.data.mute_requests!.channel_id;
        const requestURL = messageLink(requestChannelId, requestId, config.guild.id);
        const requestHyperlink = hyperlink("Your request", requestURL);

        // Log the denial
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Mute Request Denied" })
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewer.id) },
                { name: "Request Author", value: userMentionWithId(request.author_id) },
                { name: "Target", value: userMentionWithId(request.target_id) },
                { name: "Request Content", value: request.reason }
            ])
            .setTimestamp();

        const requestAuthor = await config.guild.members.fetch(request.author_id)
            .catch(() => null);

        log({
            event: LoggingEvent.MuteRequestDeny,
            member: requestAuthor,
            channel: null,
            config,
            message: {
                embeds: [embed]
            }
        });

        const reviewerName = reviewer.nickname ?? reviewer.displayName;
        config.sendNotification(`${userMention(request.author_id)} ${requestHyperlink} against ${targetMention} has been denied by \`${reviewerName}\`.`);
    }
}

interface MuteValidationResult {
    targetMember: GuildMember | null;
    data: Prisma.MuteRequestCreateInput;
}

export enum MuteRequestStatus {
    Pending = 1,
    Approved = 2,
    Denied = 3,
    Deleted = 4,
    Unknown = 5
}