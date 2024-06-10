import { ButtonInteraction, Colors, EmbedBuilder } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { MessageReportStatus } from "@utils/reports";
import { prisma } from "./..";
import { log } from "@utils/logging";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { userMentionWithId } from "@/utils";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";
import GuildConfig from "@managers/config/GuildConfig";

export default class UserReportResolve extends Component {
    constructor() {
        super("user-report-resolve");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (!config.hasPermission(interaction.member, Permission.ManageUserReports)) {
            return {
                content: "You do not have permission to manage user reports.",
                ephemeral: true,
                temporary: true
            };
        }

        // Returns null if the report is not found
        const report = await prisma.userReport.update({
            where: { id: interaction.message.id },
            data: {
                status: MessageReportStatus.Resolved,
                resolved_by: interaction.user.id
            }
        }).catch(() => null);

        if (!report) {
            await interaction.reply({
                content: "Failed to find the report. Deleting without modifying the database.",
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: "The report has been resolved.",
                ephemeral: true
            });
        }

        setTimeout(() => {
            interaction.deleteReply().catch(() => null);
        }, config.data.response_ttl);

        UserReportResolve._log(interaction, config);
        await interaction.message.delete();
        return null;
    }

    // Format: Resolved by {executor} (action: {action})
    private static _log(interaction: ButtonInteraction<"cached">, config: GuildConfig, action?: string): void {
        const [alert] = interaction.message.embeds;
        const embed = new EmbedBuilder(alert.toJSON())
            .setColor(Colors.Green)
            .setTitle("User Report Resolved");

        log({
            event: LoggingEvent.UserReportResolve,
            channel: null,
            member: interaction.member,
            config,
            message: {
                content: `Resolved by ${userMentionWithId(interaction.user.id)}${action ? ` (action: ${action})` : ""}`,
                embeds: [embed],
                allowedMentions: { parse: [] }
            }
        });
    }
}