import {
	ApplicationCommandData,
	ApplicationIntegrationType,
	AutocompleteInteraction,
	CommandInteraction,
	InteractionContextType
} from "discord.js";

import { DEFAULT_COMMAND_PERMISSIONS, DEFAULT_DM_PERMISSION } from "@utils/constants";
import { InteractionReplyData } from "@utils/types";

// The base class for all commands.
export default abstract class Command<T extends CommandInteraction> {
	/**
	 * @param data The data for the command.
	 * @protected
	 */
	protected constructor(public readonly data: ApplicationCommandData) {
	}

	/**
	 * Handles the command interaction. Mentions are disabled by default.
	 * @param interaction The interaction to handle.
	 */
	abstract execute(interaction: T): InteractionReplyData | Promise<InteractionReplyData>;

	/**
	 * Handles the associated autocomplete interaction.
	 * @param interaction The interaction to handle.
	 */
	autocomplete?(interaction: AutocompleteInteraction): Promise<void> | void;

	build(): ApplicationCommandData {
		this.data.defaultMemberPermissions ??= DEFAULT_COMMAND_PERMISSIONS;
		this.data.dmPermission ??= DEFAULT_DM_PERMISSION;
		this.data.contexts ??= [InteractionContextType.Guild];
		this.data.integrationTypes ??= [ApplicationIntegrationType.GuildInstall];

		return this.data;
	}
}