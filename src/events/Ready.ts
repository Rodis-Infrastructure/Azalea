import { MessageCache } from "@utils/messages";
import { Client, Events, GuildTextBasedChannel } from "discord.js";
import { client, health, prisma } from "@";
import { groupBy } from "lodash";
import { pluralize, startCronJob } from "@/utils";

import Logger, { AnsiColor } from "@utils/logger";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
import Reminders from "@/commands/Reminders";
import { captureException } from "@utils/sentry";

export default class Ready extends EventListener {
	constructor() {
		super(Events.ClientReady, {
			once: true
		});
	}

	execute(client: Client<true>): void {
		Logger.log("READY", `Successfully logged in as ${client.user.tag}`, {
			color: AnsiColor.Green,
			full: true
		});

		// Operations that require the global config
		MessageCache.startDatabaseCronJob();
		// Reminders.mount returns a Promise — discarding it would leak any
		// rejection. Capture and log so a failed mount doesn't kill the
		// process via the unhandled-rejection global handler.
		Reminders.mount().catch(error => captureException(error, {
			tags: { source: "reminders_mount" }
		}));

		// Start cron jobs for each guild. Per-task `.catch` so one
		// failing guild (deleted channel, missing permission) doesn't
		// strand the rest of the registrations.
		ConfigManager.guildConfigs.forEach(config => {
			const safeStart = (task: string, run: () => Promise<void>): void => {
				run().catch(error => captureException(error, {
					tags: { source: "guild_cron_mount", task, guild_id: config.guild.id }
				}));
			};
			safeStart("scheduled_messages", () => config.startScheduledMessageCronJobs());
			safeStart("mute_request_reminder", () => config.startMuteRequestReviewReminderCronJobs());
			safeStart("ban_request_reminder", () => config.startBanRequestReviewReminderCronJobs());
			safeStart("message_report_reminder", () => config.startMessageReportReviewReminderCronJob());
			safeStart("message_report_removal", () => config.startMessageReportRemovalCronJob());
			safeStart("user_report_reminder", () => config.startUserReportReviewReminderCronJob());
			safeStart("user_report_removal", () => config.startUserReportRemovalCronJob());
		});

		// These cron jobs are global — start them once, outside the forEach
		Ready._startTemporaryMessageRemovalCronJob();

		const hasRoleRequests = ConfigManager.guildConfigs.some(config => !!config.data.role_requests);
		if (hasRoleRequests) {
			Ready._startTemporaryRoleRemovalCronJob();
		}

		// Signal full readiness to the editor's health poll. Must come after
		// every cron above so a healthy response means crons are mounted.
		health.markReady();
	}

	private static _startTemporaryRoleRemovalCronJob(): void {
		// Fetch and delete all expired roles every day at midnight
		startCronJob("TEMPORARY_ROLE_REMOVAL", "0 0 * * *", async () => {
			const now = new Date();

			// Fetch all expired role assignments
			const expiredRoles = await prisma.temporaryRole.findMany({
				where: { expires_at: { lte: now } }
			});

			// Map the expired roles to their respective guilds
			const expiredRolesByGuild = groupBy(expiredRoles, role => role.guild_id);

			let removalCount = 0;

			// Remove the roles from the users. Each guild and each role is
			// wrapped so one failure (kicked-out, deleted guild, missing
			// permission) doesn't strand the rest of the tick's work.
			for (const guildId in expiredRolesByGuild) {
				const guild = await client.guilds.fetch(guildId).catch(() => null);
				if (!guild) {
					Logger.warn(`Skipping temporary role cleanup: guild ${guildId} unreachable`);
					continue;
				}
				const roles = expiredRolesByGuild[guildId];

				for (const role of roles) {
					const member = await guild.members.fetch(role.member_id).catch(() => null);

					if (member?.roles.cache.has(role.role_id)) {
						Logger.info(`Removing role ${role.role_id} from @${member.user.username} (${member.id})`);
						const removed = await member.roles.remove(role.role_id).catch(() => null);
						if (removed) removalCount++;
					}
				}
			}

			// Batch delete all expired role records at once
			if (expiredRoles.length) {
				await prisma.temporaryRole.deleteMany({
					where: { expires_at: { lte: now } }
				});
			}

			if (removalCount > 0) {
				Logger.info(`Removed ${removalCount} expired ${pluralize(removalCount, "role")}`);
			} else {
				Logger.info("No roles need to be removed");
			}
		});
	}

	private static _startTemporaryMessageRemovalCronJob(): void {
		// Fetch and delete all expired messages every day at midnight
		startCronJob("TEMPORARY_MESSAGE_REMOVAL", "0 0 * * *", async () => {
			const now = new Date();

			// Fetch and delete all expired role requests
			const [expiredMessages] = await prisma.$transaction([
				prisma.temporaryMessage.findMany({
					where: { expires_at: { lte: now } }
				}),
				prisma.temporaryMessage.deleteMany({
					where: { expires_at: { lte: now } }
				})
			]);

			// Map the expired messages to their respective channels
			const expiredMessagesByChannel = groupBy(expiredMessages, message => message.channel_id);

			let removalCount = 0;

			// Per-channel resilience: one missing or unreachable channel
			// must not prevent removal of messages in the others.
			for (const channelId in expiredMessagesByChannel) {
				const channel = await client.channels.fetch(channelId).catch(() => null) as GuildTextBasedChannel | null;
				if (!channel) {
					Logger.warn(`Skipping temporary message cleanup: channel ${channelId} unreachable`);
					continue;
				}
				const expiredMessages = expiredMessagesByChannel[channelId];

				for (const data of expiredMessages) {
					const message = await channel.messages.fetch(data.message_id)
						.catch(() => null);

					if (message) {
						Logger.info(`Removing message ${data.message_id} from #${channel.name} (${channel.id})`);
						await message.delete().catch(() => null);
						removalCount++;
					}
				}
			}

			if (removalCount > 0) {
				Logger.info(`Removed ${removalCount} expired ${pluralize(removalCount, "message")}`);
			} else {
				Logger.info("No messages need to be removed");
			}
		});
	}
}