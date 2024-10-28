import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { client } from "./..";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";
import UserInfoCommand from "@/commands/UserInfo";

export default class UserInfo extends Component {
	constructor() {
		// Format: "user-info-{targetId}"
		super({ startsWith: "user-info" });
	}

	async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const targetId = interaction.customId.split("-")[2];

		if (!targetId) {
			return {
				content: "Failed to get the target user's ID.",
				ephemeral: true,
				temporary: true
			};
		}

		const member = await interaction.guild.members
			.fetch(targetId)
			.catch(() => null);

		const user = member?.user ?? await client.users
			.fetch(targetId)
			.catch(() => null);

		if (!user) {
			return {
				content: "Failed to fetch the target user.",
				ephemeral: true,
				temporary: true
			};
		}

		return UserInfoCommand.get({
			executor: interaction.member,
			config,
			member,
			user
		});
	}
}