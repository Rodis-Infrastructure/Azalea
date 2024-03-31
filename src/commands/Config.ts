import { ApplicationCommandOptionType, AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { Snowflake } from "discord-api-types/v10";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import YAML from "yaml";

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
                        description: "The guild to view",
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
                return this.getGlobalConfigAttachment();

            case ConfigSubcommand.Guild: {
                const guildId = interaction.options.getString("guild_id") ?? interaction.guildId;
                return this.getGuildConfigAttachment(guildId);
            }
        }
    }

    getGlobalConfigAttachment(): InteractionReplyData {
        const stringifiedConfig = YAML.stringify(ConfigManager.globalConfig);
        const buffer = Buffer.from(stringifiedConfig);
        const file = new AttachmentBuilder(buffer, { name: "azalea.cfg.yml" });

        return { files: [file] };
    }

    getGuildConfigAttachment(guildId: Snowflake): InteractionReplyData {
        const guildConfig = ConfigManager.getGuildConfig(guildId);

        if (!guildConfig) {
            return "This guild doesn't have a configuration.";
        }

        // The guild property is too large to display
        const modifiedConfig = {
            ...guildConfig,
            guild: guildId
        };

        const stringifiedConfig = YAML.stringify(modifiedConfig);
        const buffer = Buffer.from(stringifiedConfig);
        const file = new AttachmentBuilder(buffer, { name: `guild.cfg.yml` });

        return { files: [file] };
    }
}

enum ConfigSubcommand {
    Global = "global",
    Guild = "guild"
}