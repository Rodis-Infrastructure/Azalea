import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction, GuildTextBasedChannel } from "discord.js";
import { handleQuickMute, THIRTY_MINUTES } from "@/commands/QuickMute30Ctx";
import { prisma } from "./..";

import Component from "@managers/components/Component";
import { MessageReportStatus } from "@utils/reports";

export default class MessageReportQuickMute30 extends Component {
    constructor() {
        super("message_report_qm30");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleMessageReportQuickMute(interaction, THIRTY_MINUTES);
    }
}

/**
 * Handles quick mute interactions for message reports
 *
 * @param interaction - The quick mute button
 * @param duration - The duration of the quick mute
 */
export async function handleMessageReportQuickMute(interaction: ButtonInteraction<"cached">, duration: number): Promise<InteractionReplyData> {
    // Returns null if the report is not found
    const report = await prisma.messageReport.findUnique({
        where: {
            id: interaction.message.id
        }
    });

    if (!report) {
        return Promise.resolve({
            content: "Failed to find the report. Unable to perform quick mute",
            ephemeral: true
        });
    }

    const sourceChannel = await interaction.guild.channels.fetch(report.channel_id) as GuildTextBasedChannel | null;
    const targetMessage = await sourceChannel?.messages.fetch(report.message_id).catch(() => null);

    if (!targetMessage) {
        return Promise.resolve({
            content: "Failed to find the message. Unable to perform quick mute",
            ephemeral: true
        });
    }

    const response = await handleQuickMute({
        executor: interaction.member,
        duration,
        targetMessage
    });

    // If the response does not contain the word "success", the quick mute failed
    if (!response.match(/success/i)) {
        return Promise.resolve({
            content: response,
            ephemeral: true
        });
    }

    await prisma.messageReport.update({
        where: { id: report.id },
        data: { status: MessageReportStatus.QuickMute30 }
    });

    await interaction.reply({
        content: response,
        ephemeral: true
    });

    await interaction.message.delete();
    return Promise.resolve(null);
}