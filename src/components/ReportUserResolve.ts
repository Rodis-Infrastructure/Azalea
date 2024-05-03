import { ButtonInteraction, Colors, EmbedBuilder } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { MessageReportStatus } from "@utils/reports";
import { prisma } from "./..";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";
import { userMentionWithId } from "@/utils";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";

export default class UserReportResolve extends Component {
    constructor() {
        super("user-report-resolve");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        // Returns null if the report is not found
        const report = await prisma.userReport.update({
            where: { id: interaction.message.id },
            data: { status: MessageReportStatus.Resolved }
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

        UserReportResolve._log(interaction);
        await interaction.message.delete();
        return null;
    }

    // Format: Resolved by {executor} (action: {action})
    private static _log(interaction: ButtonInteraction<"cached">, action?: string): void {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const [alert] = interaction.message.embeds;

        const embed = new EmbedBuilder(alert.toJSON())
            .setColor(Colors.Green)
            .setTitle("User Report Resolved");

        log({
            event: LoggingEvent.UserReportResolve,
            channel: null,
            config,
            message: {
                content: `Resolved by ${userMentionWithId(interaction.user.id)}${action ? ` (action: ${action})` : ""}`,
                embeds: [embed],
                allowedMentions: { parse: [] }
            }
        });
    }
}