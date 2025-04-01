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
import { captureException } from "@sentry/node";

import GuildConfig from "@managers/config/GuildConfig";
import StoreMediaCtx from "@/commands/StoreMediaCtx";

export default class BanRequestUtil {
	/**
     * Create or update a ban request.
     * See {@link BanRequestUtil._validate} for validation details.
     *
     * @param request - The request message.
     * @param config - The guild configuration.
     */
	static async upsert(request: Message<true>, config: GuildConfig): Promise<void> {
		const validationResult = await BanRequestUtil._validate(request, config);

		if (!validationResult.ok) {
			const requestURL = messageLink(request.channelId, request.id, request.guildId);
			const requestHyperlink = hyperlink("your ban request", requestURL);

			config.sendNotification(`${request.author} Failed to validate ${requestHyperlink}. ${validationResult.message}`);
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

	/**
     * Update the status of a ban request in the database.
     *
     * @param requestId - The request's message ID.
     * @param status - The new status.
     * @param reviewerId - The reviewer's user ID.
     */
	static async setStatus(requestId: Snowflake, status: BanRequestStatus, reviewerId: Snowflake | null): Promise<BanRequest | null> {
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
     * Perform validation on the ban request message. The following conditions must be met:
     *
     * - Valid request format.
     * - Target user exists.
     * - Target user is not already banned.
     * - Target user does not have a higher or equal role than the request author.
     * - A request for the same user is not already pending.
     * - The reason is valid. See {@link InfractionUtil.validateReason} for details.
     *
     * @param request - The request.
     * @param config - The guild configuration.
     * @returns The target user's ID and request data if the validation is successful. Otherwise, an error message.
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
				ok: false,
				message: "Invalid ban request format."
			};
		}

		// Append the media log URLs to the message content
		if (request.attachments.size) {
			const media = Array.from(request.attachments.values());
			const result = await StoreMediaCtx.storeMedia(request.member, request.author.id, media, config);

			if (result.ok) {
				args.reason += ` ${result.data.join(" ")}`;
			}
		}

		const reasonValidationResult = await InfractionUtil.validateReason(args.reason, config);

		// The infraction reason must be valid
		if (!reasonValidationResult.ok) {
			return reasonValidationResult;
		}

		const targetMember = await config.guild.members
			.fetch(args.targetId)
			.catch(() => null);

		const target = targetMember?.user ?? await client.users
			.fetch(args.targetId)
			.catch(() => null);

		// The target must user exist
		if (!target) {
			return {
				ok: false,
				message: "Invalid user."
			};
		}

		const isBanned = await config.guild.bans.fetch(args.targetId)
			.then(() => true)
			.catch(() => false);

		// The target user must not be banned
		if (isBanned) {
			return {
				ok: false,
				message: "This user is already banned."
			};
		}

		// Verify role hierarchy
		// Request author must not be able to ban a member with a higher or equal role
		if (
			request.member &&
            targetMember &&
            targetMember.roles.highest.position >= request.member.roles.highest.position
		) {
			return {
				ok: false,
				message: "You cannot ban a member with a higher or equal role."
			};
		}

		// Check whether a request for the same user is already pending
		// Ignore duplicate requests from bots
		if (!request.author.bot) {
			const originalRequest = await prisma.banRequest.findFirst({
				select: { id: true },
				where: {
					NOT: { id: request.id },
					target_id: args.targetId,
					guild_id: config.guild.id,
					status: BanRequestStatus.Pending
				}
			});

			if (originalRequest) {
				const requestURL = messageLink(request.channelId, originalRequest.id, request.guildId);

				// Notify the request author instead of rejecting the request
				// since the duplication may be intentional
				await temporaryReply(request, `A ban request for this user is already pending: ${requestURL}`, config.data.response_ttl);
			}
		}

		return {
			ok: true,
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
     * Approve a ban request by:
     *
     * - Logging the approval.
     * - Ending any active mutes for the target user.
     * - Storing the infraction in the database.
     * - Banning the target user.
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

		if (!validationResult.ok) {
			const requestURL = messageLink(request.channelId, request.id, request.guildId);
			const requestHyperlink = hyperlink("ban request", requestURL);

			config.sendNotification(`${reviewer} Failed to approve the ${requestHyperlink}. ${validationResult.message}`);
			return;
		}

		const { targetId, data } = validationResult.data;

		// Log the approval
		const banRequestApproveEmbed = new EmbedBuilder()
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
				embeds: [banRequestApproveEmbed]
			}
		});

		// Store the ban request if it doesn't exist
		// Update the reviewer and status if it does
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

		// Try to ban the user
		// if it fails, delete the infraction and notify the reviewer
		try {
			await config.guild.members.ban(targetId, {
				reason: data.reason,
				deleteMessageSeconds: config.data.delete_message_days_on_ban * SECONDS_IN_DAY
			});
		} catch (error) {
			const sentryId = captureException(error);

			InfractionManager.deleteInfraction(infraction.id);
			config.sendNotification(`${reviewer} An error occurred while banning the user (\`${sentryId}\`)`);
			return;
		}

		removeClientReactions(request);
		InfractionManager.endActiveMutes(config.guild.id, targetId);
		InfractionManager.logInfraction(infraction, reviewer, config);

		const formattedReason = InfractionUtil.formatReason(data.reason);

		config.sendNotification(
			`${userMention(data.author_id)}'s ban request against ${userMention(data.target_id)} has been approved by ${reviewer} - \`#${infraction.id}\` ${formattedReason}`,
			false
		);
	}

	/**
     * Deny a ban request by:
     *
     * - Logging the denial.
     * - Ending any active mutes for the target user.
     * - Notifying the request author.
     *
     * @param request - The request message.
     * @param reviewer - The user denying the request.
     * @param config - The guild configuration.
     */
	static async deny(request: Message<true>, reviewer: GuildMember, config: GuildConfig): Promise<void> {
		// Verify permissions
		if (!config.hasPermission(reviewer, Permission.ManageBanRequests)) {
			config.sendNotification(`${reviewer} You do not have permission to manage ban requests.`);
			return;
		}

		const requestData = await BanRequestUtil.setStatus(request.id, BanRequestStatus.Denied, reviewer.id);

		if (!requestData) {
			config.sendNotification(`${reviewer} Failed to deny the ban request, the ban request was not found.`);
			return;
		}

		// End the target user's timeout if they are in the guild
		await config.guild.members.fetch(requestData.target_id)
			.then(target => {
				target.timeout(null, `Ban request denied by @${reviewer.user.username} (${reviewer.id})\n${request.url}`);
			})
			.catch(() => null);

		InfractionManager.endActiveMutes(config.guild.id, requestData.target_id);

		// Log the denial
		const banRequestDenyEmbed = new EmbedBuilder()
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
				embeds: [banRequestDenyEmbed]
			}
		});

		const targetMention = userMention(requestData.target_id);
		const requestHyperlink = hyperlink("Your ban request", request.url);

		removeClientReactions(request);
		config.sendNotification(`${request.author} ${requestHyperlink} against ${targetMention} has been denied by \`${reviewer.displayName}\`.`);
	}
}

interface BanValidationResult {
    targetId: Snowflake;
    data: Prisma.BanRequestCreateInput;
}

export enum BanRequestStatus {
    /** The request is pending review. */
    Pending = 1,
    /** The request has been approved and the user has been banned. */
    Approved = 2,
    /** The request has been denied and the user has been unmuted. */
    Denied = 3,
    /** The request has been deleted. */
    Deleted = 4,
    /** An unsupported reaction has been added to the request. */
    Unknown = 5
}