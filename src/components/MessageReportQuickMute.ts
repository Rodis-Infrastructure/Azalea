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

export default class MessageReportQuickMute extends Component {
    constructor() {
        super({ matches: /^message-report-qm[36]0$/m });
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const duration = interaction.customId.endsWith("60")
            ? QuickMuteDuration.Long
            : QuickMuteDuration.Short;

        return handleMessageReportQuickMute(interaction, duration);
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
            ephemeral: true,
            temporary: true
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
            ephemeral: true,
            temporary: true
        });
    }

    const sourceChannel = await interaction.guild.channels.fetch(report.channel_id) as GuildTextBasedChannel | null;

    if (!sourceChannel) {
        return Promise.resolve({
            content: "Failed to fetch the source channel. Unable to perform quick mute",
            ephemeral: true,
            temporary: true
        });
    }

    const reportedMessage = await fetchMessage(report.message_id, sourceChannel);

    if (!reportedMessage) {
        return Promise.resolve({
            content: "Failed to fetch the message. Unable to perform quick mute",
            ephemeral: true,
            temporary: true
        });
    }

    const result = await handleQuickMute({
        executor: interaction.member,
        targetMessage: reportedMessage,
        duration
    });

    if (!result.success) {
        if (typeof result.message === "string") {
            return {
                content: result.message,
                ephemeral: true,
                temporary: true
            };
        } else {
            return result.message;
        }
    }

    const status = duration === QuickMuteDuration.Short
        ? MessageReportStatus.QuickMute30
        : MessageReportStatus.QuickMute60;

    await prisma.messageReport.update({
        where: { id: report.id },
        data: { status }
    });

    if (typeof result.message === "string") {
        await interaction.reply({
            content: result.message,
            ephemeral: true
        });
    } else {
        delete result.message?.temporary;
        await interaction.reply(result.message as Omit<InteractionReplyData, "temporary">);
    }

    setTimeout(() => {
        interaction.deleteReply().catch(() => null);
    }, config.data.response_ttl);

    await interaction.message.delete();
    return null;
}