import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    channelMention,
    Colors,
    EmbedBuilder,
    GuildTextBasedChannel,
    ModalSubmitInteraction,
    roleMention,
    userMention
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { userMentionWithId } from "@/utils";
import { UserReportStatus } from "@utils/reports";
import { prisma } from "./..";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";
import GuildConfig from "@managers/config/GuildConfig";

export default class ReportUser extends Component {
    constructor() {
        // Format: "report-user-{targetId}-{reportExists}"
        super({ startsWith: "report-user" });
    }

    async execute(interaction: ModalSubmitInteraction<"cached">): Promise<InteractionReplyData> {
        const reason = interaction.fields.getTextInputValue("reason");

        // Check if the reason is made up of at least one word character
        if (!reason.match(/\w/g)) {
            return {
                content: "Please provide a valid reason for reporting the user.",
                ephemeral: true
            };
        }

        const targetId = interaction.customId.split("-")[2];
        const reportExists = interaction.customId.split("-")[3] === "true";
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        // The existence of the user_reports key is checked before prompting the modal
        const userReportChannel = await config.guild.channels
            .fetch(config.data.user_reports!.report_channel)
            .catch(() => null);

        if (!userReportChannel || !userReportChannel.isTextBased()) {
            return {
                content: "An error occurred while trying to fetch the report channel, please contact staff if this keeps happening.",
                ephemeral: true
            };
        }

        if (!reportExists) {
            return ReportUser._createReport({
                interaction,
                userReportChannel,
                targetId,
                reason,
                config
            });
        }

        return ReportUser._updateReport({
            interaction,
            userReportChannel,
            targetId,
            reason,
            config
        });
    }

    private static async _createReport(data: {
        interaction: ModalSubmitInteraction<"cached">,
        userReportChannel: GuildTextBasedChannel,
        targetId: string,
        reason: string,
        config: GuildConfig
    }): Promise<InteractionReplyData> {
        const { interaction, targetId, reason, userReportChannel, config } = data;

        const embed = new EmbedBuilder()
            .setColor(0x9C84EF) // Light purple
            .setFields([
                {
                    name: "Reported By",
                    value: userMentionWithId(targetId)
                },
                {
                    name: "Target",
                    value: userMentionWithId(interaction.user.id)
                },
                {
                    name: "Reason",
                    value: reason
                }
            ])
            .setTimestamp();

        const resolveButton = new ButtonBuilder()
            .setCustomId("user-report-resolve")
            .setLabel("OK")
            .setStyle(ButtonStyle.Success);

        const infractionsButton = new ButtonBuilder()
            .setCustomId(`infraction-search-${targetId}`)
            .setLabel("Infractions")
            .setStyle(ButtonStyle.Secondary);

        const userInfoButton = new ButtonBuilder()
            .setCustomId(`user-info-${targetId}`)
            .setLabel("User Info")
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(resolveButton, infractionsButton, userInfoButton);

        if (interaction.channelId) {
            // Add the channel field after the "Reported By" field
            embed.spliceFields(1, 0, {
                name: "Source Channel",
                value: channelMention(interaction.channelId)
            });
        }

        // Mention the roles that should be pinged when a message is reported
        const mentionedRoles = config.data.user_reports!.mentioned_roles
            ?.map(roleMention)
            .join(" ");

        const { id } = await userReportChannel.send({
            content: mentionedRoles,
            embeds: [embed],
            components: [actionRow]
        });

        await prisma.userReport.create({
            data: {
                id,
                target_id: targetId,
                reported_by: interaction.user.id,
                guild_id: interaction.guildId,
                reason
            }
        });

        await log({
            event: LoggingEvent.UserReportCreate,
            message: { embeds: [embed] },
            channel: null,
            config
        });

        return {
            content: `Your report against ${userMention(targetId)} has been submitted successfully.`,
            ephemeral: true
        };
    }

    private static async _updateReport(data: {
        interaction: ModalSubmitInteraction<"cached">,
        userReportChannel: GuildTextBasedChannel,
        targetId: string,
        reason: string,
        config: GuildConfig
    }): Promise<InteractionReplyData> {
        const { interaction, targetId, reason, userReportChannel, config } = data;

        const filter = {
            target_id: targetId,
            reported_by: interaction.user.id,
            guild_id: interaction.guildId,
            status: UserReportStatus.Unresolved
        };

        const [initialReport] = await prisma.$transaction([
            prisma.userReport.findFirst({
                where: filter,
                select: { reason: true, id: true }
            }),
            prisma.userReport.updateMany({
                where: filter,
                data: { reason }
            })
        ]);

        const report = await userReportChannel.messages
            .fetch(initialReport!.id)
            .catch(() => null);

        if (!report) {
            return {
                content: "An error occurred while trying to fetch your original report, please contact staff if this keeps happening.",
                ephemeral: true
            };
        }

        const logEmbed = new EmbedBuilder(report.embeds[0].toJSON())
            .setColor(Colors.Orange)
            .setTitle("User Report Reason Changed")
            .spliceFields(-1, 1, {
                name: "Old Reason",
                value: initialReport!.reason
            }, {
                name: "New Reason",
                value: reason
            });

        const embed = new EmbedBuilder(report.embeds[0].toJSON())
            .spliceFields(-1, 1, {
                name: "Reason",
                value: reason
            });

        await Promise.all([
            report.edit({ embeds: [embed] }),
            log({
                event: LoggingEvent.UserReportUpdate,
                message: { embeds: [logEmbed] },
                channel: null,
                config
            })
        ]);

        return {
            content: `Successfully updated the reason of your report against ${userMention(targetId)}.`,
            ephemeral: true
        };
    }
}