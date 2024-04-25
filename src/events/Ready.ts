import { Messages } from "@utils/messages";
import { Client, Events } from "discord.js";
import { client, prisma } from "./..";
import { Prisma } from "@prisma/client";
import { CronJob } from "cron";

import Logger, { AnsiColor } from "@utils/logger";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

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

        // Start scheduled messages for all guilds
        ConfigManager.guildConfigs.forEach(config => {
            config.startScheduledMessageCronJobs();
            config.startRequestAlertCronJobs();
            config.startMessageReportAlertCronJob();
            config.startMessageReportRemovalCronJob();

            if (config.data.role_requests) {
                Ready._startRoleRequestRemovalCronJob();
            }
        });
    }

    private static _startRoleRequestRemovalCronJob(): void {
        Logger.info("Starting role request removal cron job");

        // Fetch and delete all expired role requests every day at midnight
        new CronJob("0 0 * * *", async () => {
            Logger.info("Running role request removal cron job");

            // Fetch and delete all expired role requests
            const [expiredRequests] = await prisma.$transaction([
                prisma.roleRequest.findMany({
                    where: { expires_at: { lte: new Date() } }
                }),
                prisma.roleRequest.deleteMany({
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
            }, {} as Record<string, Prisma.RoleRequestCreateInput[]>);

            let removalCount = 0;

            // Remove the roles from the users
            for (const guildId in expiredRequestsByGuild) {
                const guild = await client.guilds.fetch(guildId);
                const expiredRequests = expiredRequestsByGuild[guildId];

                for (const request of expiredRequests) {
                    const member = await guild.members.fetch(request.member_id);

                    if (member.roles.cache.has(request.role_id)) {
                        await member.roles.remove(request.role_id);
                        removalCount++;
                    }
                }
            }

            Logger.info(`Removed ${removalCount} expired role requests`);
        }).start();

        Logger.info("Role request removal cron job started");
    }
}