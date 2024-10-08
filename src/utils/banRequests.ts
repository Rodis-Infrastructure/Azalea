import {
    Colors,
    EmbedBuilder,
    GuildMember,
    hyperlink,
    Message,
    messageLink,
    Snowflake,
    userMention
} from "discord.js";

import { Result } from "./types";
import { BanRequest, Prisma } from "@prisma/client";
import { TypedRegEx } from "typed-regex";
import { client, prisma } from "./..";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { removeClientReactions, temporaryReply } from "./messages";
import { InfractionAction, InfractionManager, InfractionUtil } from "./infractions";
import { SECONDS_IN_DAY } from "@/commands/Ban";
import { userMentionWithId } from "./index";
import { log } from "./logging";

import GuildConfig from "@managers/config/GuildConfig";
import StoreMediaCtx from "@/commands/StoreMediaCtx";

export default class BanRequestUtil {
    static async upsert(request: Message<true>, config: GuildConfig): Promise<void> {
        const validationResult = await BanRequestUtil._validate(request, config);

        if (!validationResult.success) {
            await temporaryReply(request, validationResult.message, config.data.response_ttl);
            await request.react("⚠️");
            return;
        }

        const { data } = validationResult.data;
        removeClientReactions(request);

        await prisma.banRequest.upsert({
            where: { id: request.id },
            create: data,
            update: {
                target_id: data.target_id,
                reason: data.reason
            }
        });
    }

    static async setStatus(requestId: Snowflake, status: BanRequestStatus, reviewerId: Snowflake): Promise<BanRequest | null> {
        try {
            return await prisma.banRequest.update({
                where: { id: requestId },
                data: { status, reviewer_id: reviewerId }
            });
        } catch {
            return null;
        }
    }

    /**
     * Perform validation on the ban request message.
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
    private static async _validate(request: Message<true>, config: GuildConfig): Promise<Result<BanValidationResult>> {
        /**
         * Regex pattern for extracting the target ID and reason from the message content.
         * ## Examples
         *
         * - `<@!123456789012345678> Spamming`
         * - `<@123456789012345678> Spamming`
         * - `123456789012345678 Spamming`
         */
        const re = TypedRegEx("^(?:<@!?)?(?<targetId>\\d{17,19})>? +(?<reason>(?:[\\n\\r]|.)+)", "mi");
        const args = re.captures(request.content);

        // Validate the request format
        if (!args) {
            return {
                success: false,
                message: "Invalid ban request format."
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

        const isBanned = await config.guild.bans.fetch(args.targetId)
            .then(() => true)
            .catch(() => false);

        if (isBanned) {
            return {
                success: false,
                message: "This user is already banned."
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
                message: "You cannot ban a member with a higher or equal role."
            };
        }

        // Check if the request is a duplicate
        const originalRequest = await prisma.banRequest.findFirst({
            select: { id: true },
            where: {
                NOT: { id: request.id },
                target_id: args.targetId,
                guild_id: config.guild.id,
                status: BanRequestStatus.Pending
            }
        });

        // Ignore duplicate requests from bots
        if (originalRequest && !request.author.bot) {
            const requestURL = messageLink(request.channelId, originalRequest.id, request.guildId);
            await temporaryReply(request, `A ban request for this user is already pending: ${requestURL}`, config.data.response_ttl);
        }

        return {
            success: true,
            data: {
                targetId: args.targetId,
                data: {
                    id: request.id,
                    author_id: request.author.id,
                    target_id: target.id,
                    guild_id: config.guild.id,
                    reason: args.reason,
                    status: BanRequestStatus.Pending
                }
            }
        };
    }

    /**
     * Approve a moderation request.
     *
     * @param request - The request message.
     * @param reviewer - The user approving the request.
     * @param config - The guild configuration.
     */
    static async approve(request: Message<true>, reviewer: GuildMember, config: GuildConfig): Promise<void> {
        // Verify permissions
        if (!config.hasPermission(reviewer, Permission.ManageBanRequests)) {
            config.sendNotification(`${reviewer} You do not have permission to manage ban requests.`);
            return;
        }

        const validationResult = await BanRequestUtil._validate(request, config);

        if (!validationResult.success) {
            config.sendNotification(`${reviewer} Failed to approve the ban request. ${validationResult.message}`);
            return;
        }

        const { targetId, data } = validationResult.data;

        // Log the approval
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Ban Request Approved" })
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewer.id) },
                { name: "Request Author", value: userMentionWithId(data.author_id) },
                { name: "Target", value: userMentionWithId(data.target_id) },
                { name: "Request Content", value: data.reason }
            ])
            .setTimestamp();

        log({
            event: LoggingEvent.BanRequestApprove,
            member: request.member,
            channel: null,
            config,
            message: {
                embeds: [embed]
            }
        });

        const formattedReason = InfractionUtil.formatReason(data.reason);

        await prisma.banRequest.upsert({
            where: { id: request.id },
            create: {
                ...data,
                reviewer_id: reviewer.id,
                status: BanRequestStatus.Approved
            },
            update: {
                status: BanRequestStatus.Approved,
                reviewer_id: reviewer.id,
                target_id: data.target_id,
                reason: data.reason
            }
        });

        const infraction = await InfractionManager.storeInfraction({
            guild_id: data.guild_id,
            executor_id: reviewer.id,
            request_author_id: data.author_id,
            target_id: data.target_id,
            reason: data.reason,
            action: InfractionAction.Ban
        });

        try {
            await config.guild.members.ban(targetId, {
                reason: data.reason,
                deleteMessageSeconds: config.data.delete_message_days_on_ban * SECONDS_IN_DAY
            });
        } catch {
            InfractionManager.deleteInfraction(infraction.id);
            config.sendNotification(`${reviewer} Failed to ban the user.`);
            return;
        }

        removeClientReactions(request);
        InfractionManager.endActiveMutes(config.guild.id, targetId);
        InfractionManager.logInfraction(infraction, reviewer, config);

        config.sendNotification(
            `${userMention(data.author_id)}'s ban request against ${userMention(data.target_id)} has been approved by ${reviewer} - \`#${infraction.id}\` ${formattedReason}`,
            false
        );
    }

    /**
     * Deny a moderation request.
     *
     * @param request - The request message.
     * @param reviewer - The user denying the request.
     * @param config - The guild configuration.
     */
    static async deny(request: Message<true>, reviewer: GuildMember, config: GuildConfig): Promise<void> {
        if (!config.hasPermission(reviewer, Permission.ManageBanRequests)) {
            config.sendNotification(`${reviewer} You do not have permission to manage ban requests.`);
            return;
        }

        const requestData = await BanRequestUtil.setStatus(request.id, BanRequestStatus.Denied, reviewer.id);

        if (!requestData) {
            config.sendNotification(`${reviewer} Failed to deny the ban request, the ban request was not found.`);
            return;
        }

        await config.guild.members.fetch(requestData.target_id)
            .then(target => target.timeout(null, "Ban request denial"))
            .catch(() => null);

        InfractionManager.endActiveMutes(config.guild.id, requestData.target_id);

        // Log the denial
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Ban Request Denied" })
            .setFields([
                { name: "Reviewer", value: userMentionWithId(reviewer.id) },
                { name: "Request Author", value: userMentionWithId(requestData.author_id) },
                { name: "Target", value: userMentionWithId(requestData.target_id) },
                { name: "Request Content", value: requestData.reason }
            ])
            .setTimestamp();

        log({
            event: LoggingEvent.BanRequestDeny,
            member: request.member,
            channel: null,
            config,
            message: {
                embeds: [embed]
            }
        });

        const reviewerName = reviewer.nickname ?? reviewer.displayName;
        const targetMention = userMention(requestData.target_id);
        const requestHyperlink = hyperlink("Your ban request", request.url);

        removeClientReactions(request);
        config.sendNotification(`${request.author} ${requestHyperlink} against ${targetMention} has been denied by \`${reviewerName}\`.`);
    }
}

interface BanValidationResult {
    targetId: Snowflake;
    data: Prisma.BanRequestCreateInput;
}

export enum BanRequestStatus {
    Pending = 1,
    Approved = 2,
    Denied = 3,
    Deleted = 4,
    Unknown = 5
}