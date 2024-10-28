import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";
import MessageReactionAdd from "@/events/MessageReactionAdd";
import ConfigManager from "@managers/config/ConfigManager";

export default class ReportMessageCtx extends Command<MessageContextMenuCommandInteraction> {
	constructor() {
		super({
			name: "Report message",
			type: ApplicationCommandType.Message,
			nameLocalizations: {
				ru: "Пожаловаться на сообщение",
				id: "Laporkan pesan",
				fr: "Signaler le message",
				it: "Segnala messaggio"
			}
		});
	}

	async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const targetUser = interaction.targetMessage.author;
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		if (targetUser.bot) {
			return Promise.resolve({
				content: "You cannot report bots",
				temporary: true
			});
		}

		await MessageReactionAdd.createMessageReport(
			interaction.user.id,
			interaction.targetMessage,
			config
		);

		return Promise.resolve({
			content: `Successfully reported ${targetUser}, thank you for your report!`,
			temporary: true
		});
	}
}