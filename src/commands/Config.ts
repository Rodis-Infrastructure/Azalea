import { ApplicationCommandOptionType, AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { Snowflake } from "discord-api-types/v10";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import YAML from "yaml";

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
            description: "View the guild's configuration",
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

            default:
                return "Unknown subcommand";
        }
    }

    /**
     * Retrieves the global configuration as a YAML file and sends it as an attachment.
     *
     * @returns The global configuration as an interaction reply
     * @private
     */
    private static _getGlobalConfigAttachment(): InteractionReplyData {
        const stringifiedConfig = YAML.stringify(ConfigManager.globalConfig);
        const buffer = Buffer.from(stringifiedConfig);
        const file = new AttachmentBuilder(buffer, { name: "azalea.cfg.yml" });

        return { files: [file] };
    }

    /**
     * Retrieves the guild configuration as a YAML file and sends it as an attachment.
     *
     * @param guildId - The guild ID to retrieve the configuration for
     * @returns The guild configuration as an interaction reply
     * @private
     */
    private static _getGuildConfigAttachment(guildId: Snowflake): InteractionReplyData {
        const guildConfig = ConfigManager.getGuildConfig(guildId);

        if (!guildConfig) {
            return "This guild doesn't have a configuration.";
        }

        const stringifiedConfig = YAML.stringify(guildConfig.data);
        const buffer = Buffer.from(stringifiedConfig);

        const file = new AttachmentBuilder(buffer, {
            name: `${guildConfig.guild.id}.cfg.yml`
        });

        return { files: [file] };
    }
}

// The subcommands available for the {@link Config} command
enum ConfigSubcommand {
    Global = "global",
    Guild = "guild"
}