import { Messages } from "@utils/messages";
import { Client, Events } from "discord.js";
import { client, prisma } from "./..";
import { Prisma } from "@prisma/client";
import { startCronJob } from "@/utils";

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
        Messages.startDbStorageCronJob();
        Reminders.mount();

        // Start scheduled messages for all guilds
        ConfigManager.guildConfigs.forEach(config => {
            config.startScheduledMessageCronJobs();
            config.startRequestReviewReminderCronJobs();
            config.startMessageReportReviewReminderCronJob();
            config.startMessageReportRemovalCronJob();
            config.startUserReportReviewReminderCronJob();
            config.startUserReportRemovalCronJob();

            if (config.data.role_requests) {
                Ready._startTemporaryRoleRemovalCronJob();
            }
        });
    }

    private static _startTemporaryRoleRemovalCronJob(): void {
        // Fetch and delete all expired role requests every day at midnight
        startCronJob("TEMPORARY_ROLE_REMOVAL", "0 0 * * *", async () => {
            // Fetch and delete all expired role requests
            const [expiredRequests] = await prisma.$transaction([
                prisma.temporaryRole.findMany({
                    where: { expires_at: { lte: new Date() } }
                }),
                prisma.temporaryRole.deleteMany({
                    where: { expires_at: { lte: new Date() } }
                })
            ]);

            // Map the expired requests to their respective guilds
            const expiredRequestsByGuild = expiredRequests.reduce((acc, request) => {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (!acc[request.guild_id]) {
                    acc[request.guild_id] = [];
                }

                acc[request.guild_id].push(request);
                return acc;
            }, {} as Record<string, Prisma.TemporaryRoleCreateInput[]>);

            let removalCount = 0;

            // Remove the roles from the users
            for (const guildId in expiredRequestsByGuild) {
                const guild = await client.guilds.fetch(guildId);
                const expiredRequests = expiredRequestsByGuild[guildId];

                for (const request of expiredRequests) {
                    const member = await guild.members.fetch(request.member_id);

                    if (member.roles.cache.has(request.role_id)) {
                        Logger.info(`Removing role ${request.role_id} from @${member.user.username} (${member.id})`);
                        await member.roles.remove(request.role_id);
                        removalCount++;
                    }
                }
            }

            if (removalCount > 0) {
                Logger.info(`Removed ${removalCount} expired role requests`);
            } else {
                Logger.info("No roles need to be removed");
            }
        });
    }
}