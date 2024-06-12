import {
    ActionRowBuilder,
    ApplicationCommandType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserContextMenuCommandInteraction
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { prisma } from "./..";
import { UserReportStatus } from "@utils/reports";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";

export default class ReportUserCtx extends Command<UserContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Report user",
            type: ApplicationCommandType.User,
            nameLocalizations: {
                ru: "Пожаловаться на пользователя",
                id: "Laporkan akun",
                fr: "Signaler l'utilisateur",
                it: "Segnala utente"
            }
        });
    }

    async execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (!config.data.user_reports) {
            return {
                content: "User reports are disabled in this server.",
                ephemeral: true,
                temporary: true
            };
        }

        const excludedRoles = config.data.user_reports.exclude_roles;
        const isExcluded = interaction.targetMember?.roles.cache
            .some(role => excludedRoles.includes(role.id)) ?? false;

        if (isExcluded) {
            return {
                content: "You cannot report this user.",
                ephemeral: true,
                temporary: true
            };
        }

        const report = await prisma.userReport.findFirst({
            where: {
                target_id: interaction.targetId,
                reported_by: interaction.user.id,
                guild_id: interaction.guildId,
                status: UserReportStatus.Unresolved
            },
            select: {
                reason: true
            }
        });

        const reason = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason")
            .setPlaceholder(`Enter the reason for reporting @${interaction.targetUser.username}`)
            .setValue(report?.reason ?? "")
            .setRequired(true)
            .setMaxLength(EMBED_FIELD_CHAR_LIMIT)
            .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder<TextInputBuilder>()
            .setComponents(reason);

        const modal = new ModalBuilder()
            .setCustomId(`report-user-${interaction.targetId}-${Boolean(report)}`)
            .setTitle(`Report @${interaction.targetUser.username}`)
            .setComponents(actionRow);

        await interaction.showModal(modal);
        return null;
    }
}