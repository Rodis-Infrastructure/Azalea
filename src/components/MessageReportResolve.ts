import { ButtonInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { MessageReportStatus } from "@utils/reports";
import { prisma } from "./..";

import Component from "@managers/components/Component";

export default class MessageReportResolve extends Component {
    constructor() {
        super("message-report-resolve");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        // Returns null if the report is not found
        const report = await prisma.messageReport.update({
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

        await interaction.message.delete();
        return null;
    }
}