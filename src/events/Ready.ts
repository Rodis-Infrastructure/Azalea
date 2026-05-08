import { MessageCache } from "@utils/messages";
import { Client, Events, GuildTextBasedChannel } from "discord.js";
import { client, prisma } from "@";
import { groupBy } from "lodash";
import { pluralize, startCronJob } from "@/utils";

import Logger, { AnsiColor } from "@utils/logger";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
import Reminders from "@/commands/Reminders";

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
		Reminders.mount();

		// Start scheduled messages for all guilds
		ConfigManager.guildConfigs.forEach(config => {
			config.startScheduledMessageCronJobs();
			config.startMuteRequestReviewReminderCronJobs();
			config.startBanRequestReviewReminderCronJobs();
			config.startMessageReportReviewReminderCronJob();
			config.startMessageReportRemovalCronJob();
			config.startUserReportReviewReminderCronJob();
			config.startUserReportRemovalCronJob();
		});

		// These cron jobs are global — start them once, outside the forEach
		Ready._startTemporaryMessageRemovalCronJob();

		const hasRoleRequests = ConfigManager.guildConfigs.some(config => !!config.data.role_requests);
		if (hasRoleRequests) {
			Ready._startTemporaryRoleRemovalCronJob();
		}
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

			// Remove the roles from the users
			for (const guildId in expiredRolesByGuild) {
				const guild = await client.guilds.fetch(guildId);
				const roles = expiredRolesByGuild[guildId];

				for (const role of roles) {
					const member = await guild.members.fetch(role.member_id).catch(() => null);

					if (member?.roles.cache.has(role.role_id)) {
						Logger.info(`Removing role ${role.role_id} from @${member.user.username} (${member.id})`);
						await member.roles.remove(role.role_id);
						removalCount++;
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

			// Remove the roles from the users
			for (const channelId in expiredMessagesByChannel) {
				const channel = await client.channels.fetch(channelId) as GuildTextBasedChannel;
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