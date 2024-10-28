import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import Infraction, { InfractionSearchFilter } from "./Infraction";
import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";
import { Permission } from "@managers/config/schema";

export default class SearchInfractionsCtx extends Command<UserContextMenuCommandInteraction> {
	constructor() {
		super({
			name: "Search infractions",
			type: ApplicationCommandType.User
		});
	}

	execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const member = interaction.targetMember;

		if (
			member &&
            config.hasPermission(member, Permission.ViewInfractions) &&
            !config.hasPermission(interaction.member, Permission.ViewModerationActivity)
		) {
			return Promise.resolve({
				content: "You do not have permission to view this user's infractions.",
				ephemeral: true,
				temporary: true
			});
		}

		return Infraction.search({
			user: interaction.targetUser,
			guildId: interaction.guildId,
			filter: InfractionSearchFilter.Infractions,
			member,
			page: 1
		});
	}
}