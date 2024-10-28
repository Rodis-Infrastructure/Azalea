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

export default class MessageReportResolve extends Component {
	constructor() {
		super("message-report-resolve");
	}

	async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		if (!config.hasPermission(interaction.member, Permission.ManageMessageReports)) {
			return {
				content: "You do not have permission to manage message reports.",
				ephemeral: true,
				temporary: true
			};
		}

		// Returns null if the report is not found
		await prisma.messageReport.update({
			where: { id: interaction.message.id },
			data: {
				status: MessageReportStatus.Resolved,
				resolved_by: interaction.user.id
			}
		}).catch(() => null);

		MessageReportResolve.log(interaction, config);

		// Delete the report
		await interaction.deferUpdate();
		await interaction.deleteReply();
		return null;
	}

	// Format: Resolved by {executor} (action: {action})
	static log(interaction: ButtonInteraction<"cached">, config: GuildConfig, action?: string): void {
		const [reminder] = interaction.message.embeds;
		const embed = new EmbedBuilder(reminder.toJSON())
			.setColor(Colors.Green)
			.setTitle("Message Report Resolved");

		log({
			event: LoggingEvent.MessageReportResolve,
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