import { Collection } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { readYamlFile } from "@/utils";

import GuildConfig, { GlobalConfig } from "./GuildConfig";
import fs from "fs";

export default class ConfigManager {
    // Guild configurations mapped by their guild's IDs
    private static guildConfigs = new Collection<Snowflake, GuildConfig>();
    static globalConfig: GlobalConfig;

    // Initialize the config manager by loading all configs from the configs directory
    static async loadGuildConfigs(): Promise<void> {
        // Get all files in the configs directory (excluding the example file)
        const files = fs.readdirSync("configs")
            .filter(file => file !== "example.yml");

        for (const file of files) {
            // Extract the guild ID from the file name
            const [guildId] = file.split(".");

            // Parse the config file and set default values
            const parsedConfig = readYamlFile(`configs/${file}`);
            const config = await GuildConfig.bind(guildId, parsedConfig);

            // Validate the config and cache it
            config.validate();

            this.addGuildConfig(guildId, config);
        }
    }

    static loadGlobalConfig(): void {
        // Load and parse the global config from the azalea.cfg.yml file
        this.globalConfig = readYamlFile<GlobalConfig>("azalea.cfg.yml");
    }

    // Cache an instance of a guild configuration
    static addGuildConfig(guildId: Snowflake, config: GuildConfig): GuildConfig {
        return this.guildConfigs.set(guildId, config).first()!;
    }

    static getGuildConfig(guildId: Snowflake, exists: true): GuildConfig;
    static getGuildConfig(guildId: Snowflake, exists?: false): GuildConfig | undefined;
    // Get a guild configuration by its guild ID
    static getGuildConfig(guildId: Snowflake, exists?: boolean): GuildConfig | undefined {
        return exists
            ? this.guildConfigs.get(guildId)!
            : this.guildConfigs.get(guildId);
    }
}