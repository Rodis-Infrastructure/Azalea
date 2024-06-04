import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction, GuildTextBasedChannel } from "discord.js";
import { handleQuickMute } from "@/commands/QuickMute30Ctx";
import { MessageReportStatus } from "@utils/reports";
import { MuteDuration } from "@utils/infractions";
import { fetchMessage } from "@utils/messages";
import { prisma } from "./..";

import Component from "@managers/components/Component";
import MessageReportResolve from "./MessageReportResolve";

export default class MessageReportQuickMute30 extends Component {
    constructor() {
        super("message-report-qm30");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        MessageReportResolve.log(interaction, "quick mute (30m)");
        return handleMessageReportQuickMute(interaction, MuteDuration.Short);
    }
}

/**
 * Handles quick mute interactions for message reports.
 * Has an **ephemeral** response
 *
 * @param interaction - The quick mute button
 * @param duration - The duration of the quick mute
 */
export async function handleMessageReportQuickMute(interaction: ButtonInteraction<"cached">, duration: MuteDuration): Promise<InteractionReplyData> {
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

    if (!sourceChannel) {
        return Promise.resolve({
            content: "Failed to fetch the source channel. Unable to perform quick mute",
            ephemeral: true
        });
    }

    const reportedMessage = await fetchMessage(report.message_id, sourceChannel);

    if (!reportedMessage) {
        return Promise.resolve({
            content: "Failed to fetch the message. Unable to perform quick mute",
            ephemeral: true
        });
    }

    const result = await handleQuickMute({
        executor: interaction.member,
        targetMessage: reportedMessage,
        duration
    });

    if (!result.success) {
        return Promise.resolve({
            content: result.message,
            ephemeral: true
        });
    }

    const status = duration === MuteDuration.Short
        ? MessageReportStatus.QuickMute30
        : MessageReportStatus.QuickMute60;

    await prisma.messageReport.update({
        where: { id: report.id },
        data: { status }
    });

    await interaction.reply({
        content: result.message,
        ephemeral: true
    });

    await interaction.message.delete();
    return Promise.resolve(null);
}