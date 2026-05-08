import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { CommandResponse } from "@utils/types";
import { handleQuickMute } from "./QuickMute30Ctx";
import { QuickMuteDuration } from "@utils/infractions";

import Command from "@managers/commands/Command";

export default class QuickMute60Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "Quick mute (1h)",
			type: ApplicationCommandType.Message
		});
	}

	async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<CommandResponse> {
		const result = await handleQuickMute({
			executor: interaction.member,
			targetMessage: interaction.targetMessage,
			duration: QuickMuteDuration.OneHour
		});

		if (!result.ok) {
			return {
				content: result.message,
				temporary: true
			};
		}

		return result.data;
	}
}