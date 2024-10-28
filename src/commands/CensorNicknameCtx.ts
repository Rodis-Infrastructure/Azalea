import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import CensorNickname from "./CensorNickname";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

export default class CensorNicknameCtx extends Command<UserContextMenuCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "Censor nickname",
			type: ApplicationCommandType.User
		});
	}

	execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		return CensorNickname.handle(interaction.member, interaction.targetMember, config);
	}
}