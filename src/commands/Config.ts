import { ApplicationCommandOptionType, AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { Snowflake } from "discord-api-types/v10";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import path from "path";
import fs from "fs";

/**
 * Displays the global or guild configuration in a YAML file.
 *
 * - {@link ConfigSubcommand.Guild} - If the guild ID is not provided, the command will default to the current guild.
 * - {@link ConfigSubcommand.Global} - Displays the global configuration.
 */
export default class Config extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "config",
			description: "View the configuration",
			options: [
				{
					name: ConfigSubcommand.Guild,
					description: "View a guild's configuration",
					type: ApplicationCommandOptionType.Subcommand,
					options: [{
						name: "guild_id",
						description: "The guild ID to view the configuration for",
						type: ApplicationCommandOptionType.String
					}]
				},
				{
					name: ConfigSubcommand.Global,
					description: "View the global configuration",
					type: ApplicationCommandOptionType.Subcommand
				}
			]
		});
	}

	execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
		const subcommand = interaction.options.getSubcommand() as ConfigSubcommand;

		switch (subcommand) {
			case ConfigSubcommand.Global:
				return Config._getGlobalConfigAttachment();

			case ConfigSubcommand.Guild: {
				const guildId = interaction.options.getString("guild_id") ?? interaction.guildId;
				return Config._getGuildConfigAttachment(guildId);
			}
		}
	}

	/**
     * Retrieves the global configuration as a YAML file and sends it as an attachment.
     *
     * @returns The global configuration as an interaction reply
     * @private
     */
	private static _getGlobalConfigAttachment(): InteractionReplyData {
		const fileContent = fs.readFileSync("azalea.cfg.yml", "utf-8");
		const buffer = Buffer.from(fileContent);
		const attachment = new AttachmentBuilder(buffer, { name: "azalea.cfg.yml" });

		return { files: [attachment] };
	}

	/**
     * Retrieves the guild configuration as a YAML file and sends it as an attachment.
     *
     * @param guildId - The guild ID to retrieve the configuration for
     * @returns The guild configuration as an interaction reply
     * @private
     */
	private static _getGuildConfigAttachment(guildId: Snowflake): InteractionReplyData {
		const config = ConfigManager.getGuildConfig(guildId);

		if (!config) {
			return "This guild doesn't have a configuration.";
		}

		const filepath = path.resolve(`configs/${config.guild.id}.yml`);
		const fileContent = fs.readFileSync(filepath, "utf-8");
		const buffer = Buffer.from(fileContent);
		const attachment = new AttachmentBuilder(buffer, { name: filepath });

		return { files: [attachment] };
	}
}

enum ConfigSubcommand {
    Global = "global",
    Guild = "guild"
}