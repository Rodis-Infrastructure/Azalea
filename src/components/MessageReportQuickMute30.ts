import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction, GuildTextBasedChannel } from "discord.js";
import { handleQuickMute } from "@/commands/QuickMute30Ctx";
import { MessageReportStatus } from "@utils/reports";
import { QuickMuteDuration } from "@utils/infractions";
import { Permission } from "@managers/config/schema";
import { fetchMessage } from "@utils/messages";
import { prisma } from "./..";

import Component from "@managers/components/Component";
import MessageReportResolve from "./MessageReportResolve";
import ConfigManager from "@managers/config/ConfigManager";

export default class MessageReportQuickMute30 extends Component {
    constructor() {
        super("message-report-qm30");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleMessageReportQuickMute(interaction, QuickMuteDuration.Short);
    }
}

/**
 * Handles quick mute interactions for message reports.
 * Has an **ephemeral** response
 *
 * @param interaction - The quick mute button
 * @param duration - The duration of the quick mute
 */
export async function handleMessageReportQuickMute(interaction: ButtonInteraction<"cached">, duration: QuickMuteDuration): Promise<InteractionReplyData> {
    const config = ConfigManager.getGuildConfig(interaction.guildId, true);

    if (!config.hasPermission(interaction.member, Permission.QuickMute)) {
        return Promise.resolve({
            content: "You do not have permission to execute quick mutes",
            allowedMentions: { parse: [], repliedUser: true },
            ephemeral: true
        });
    }

    switch (duration) {
        case QuickMuteDuration.Short:
            MessageReportResolve.log(interaction, config, "quick mute (30m)");
            break;

        case QuickMuteDuration.Long:
            MessageReportResolve.log(interaction, config, "quick mute (60m)");
            break;
    }

    // Returns null if the report is not found
    const report = await prisma.messageReport.findUnique({
        where: {
            id: interaction.message.id
        }
    });

    if (!report) {
        return Promise.resolve({
            content: "Failed to find the report. Unable to perform quick mute",
            allowedMentions: { parse: [], repliedUser: true },
            ephemeral: true
        });
    }

    const sourceChannel = await interaction.guild.channels.fetch(report.channel_id) as GuildTextBasedChannel | null;

    if (!sourceChannel) {
        return Promise.resolve({
            content: "Failed to fetch the source channel. Unable to perform quick mute",
            allowedMentions: { parse: [], repliedUser: true },
            ephemeral: true
        });
    }

    const reportedMessage = await fetchMessage(report.message_id, sourceChannel);

    if (!reportedMessage) {
        return Promise.resolve({
            content: "Failed to fetch the message. Unable to perform quick mute",
            allowedMentions: { parse: [], repliedUser: true },
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
            allowedMentions: { parse: [], repliedUser: true },
            ephemeral: true
        });
    }

    const status = duration === QuickMuteDuration.Short
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