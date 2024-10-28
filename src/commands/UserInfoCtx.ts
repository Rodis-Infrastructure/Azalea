import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";
import UserInfo from "./UserInfo";
import ConfigManager from "@managers/config/ConfigManager";

export default class UserInfoCtx extends Command<UserContextMenuCommandInteraction> {
	constructor() {
		super({
			name: "User info",
			type: ApplicationCommandType.User
		});
	}

	execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		return UserInfo.get({
			member: interaction.targetMember,
			user: interaction.targetUser,
			executor: interaction.member,
			config
		});
	}
}