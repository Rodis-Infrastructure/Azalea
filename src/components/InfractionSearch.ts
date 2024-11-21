import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { Permission } from "@managers/config/schema";
import { client } from "./..";

import Component from "@managers/components/Component";
import Infraction, { InfractionSearchFilter } from "@/commands/Infraction";
import ConfigManager from "@managers/config/ConfigManager";

export default class InfractionSearch extends Component {
	constructor() {
		// Format: infraction-search-{userId}
		super({ matches: /^infraction-search-\d{17,19}$/m });
	}

	async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		if (!config.hasPermission(interaction.member, Permission.ViewInfractions)) {
			return {
				content: "You do not have permission to view infractions.",
				ephemeral: true,
				temporary: true
			};
		}

		const userId = interaction.customId.split("-")[2];
		const member = await interaction.guild.members.fetch(userId)
			.catch(() => null);

		const user = member?.user ?? await client.users.fetch(userId)
			.catch(() => null);

		if (!user) {
			return {
				content: "Failed to fetch the target user.",
				ephemeral: true,
				temporary: true
			};
		}

		// Defer the reply to ensure the command doesn't time out
		const isEphemeral = config.channelInScope(interaction.channel);
		await interaction.deferReply({ ephemeral: isEphemeral });

		return Infraction.search({
			filter: InfractionSearchFilter.All,
			guildId: interaction.guildId,
			page: 1,
			member,
			user
		});
	}
}