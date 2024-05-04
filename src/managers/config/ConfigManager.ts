import { Collection } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { pluralize, readYamlFile } from "@/utils";
import { GlobalConfig, globalConfigSchema } from "./schema";
import { fromZodError } from "zod-validation-error";

import GuildConfig from "./GuildConfig";
import Logger, { AnsiColor } from "@utils/logger";
import fs from "fs";

export default class ConfigManager {
    // Guild configurations mapped by their guild's IDs
    static guildConfigs = new Collection<Snowflake, GuildConfig>();
    static globalConfig: GlobalConfig;

    // Initialize the config manager by loading all configs from the configs directory
    static async cacheGuildConfigs(): Promise<void> {
        Logger.info("Caching guild configurations...");

        if (!fs.existsSync("configs")) {
            Logger.error("Configs directory not found, at least one guild config is required");
            process.exit(1);
        }

        // Get all files in the configs directory (excluding the example file)
        const files = fs.readdirSync("configs")
            .filter(file => file !== "example.yml");

        if (!files.length) {
            Logger.error("No guild configs found, at least one guild config is required");
            process.exit(1);
        }

        for (const file of files) {
            // Extract the guild ID from the file name
            const [guildId] = file.split(".");
            // Parse the config file and set default values
            const parsedConfig = readYamlFile(`configs/${file}`);

            const config = await GuildConfig.from(guildId, parsedConfig).catch(error => {
                Logger.error(`Failed to parse config for guild with ID ${guildId} - ${error.message}`);
                process.exit(1);
            });

            if (!config) continue;

            // Validate the config and cache it
            ConfigManager.addGuildConfig(guildId, config);

            Logger.log(`GUILD_CONFIG`, `Cached config for guild with ID ${guildId}`, {
                color: AnsiColor.Purple
            });
        }

        const configCount = ConfigManager.guildConfigs.size;
        Logger.info(`Cached ${configCount} guild ${pluralize(configCount, "configuration")}`);
    }

    static cacheGlobalConfig(): void {
        Logger.info("Caching global configuration...");

        if (!fs.existsSync("azalea.cfg.yml")) {
            Logger.error("Global config file not found, it is required");
            process.exit(1);
        }

        // Load and parse the global config from the azalea.cfg.yml file
        const rawConfig = readYamlFile<GlobalConfig>("azalea.cfg.yml");
        ConfigManager.globalConfig = ConfigManager.parseGlobalConfig(rawConfig);

        Logger.info("Cached global configuration");
    }

    static parseGlobalConfig(data: unknown): GlobalConfig {
        const parseResult = globalConfigSchema.safeParse(data);

        if (!parseResult.success) {
            const validationError = fromZodError(parseResult.error);
            Logger.error(validationError.toString());
            process.exit(1);
        }

        return parseResult.data;
    }

    // Cache an instance of a guild configuration
    static addGuildConfig(guildId: Snowflake, config: GuildConfig): GuildConfig {
        return ConfigManager.guildConfigs.set(guildId, config).first()!;
    }

    static getGuildConfig(guildId: Snowflake, exists: true): GuildConfig;
    static getGuildConfig(guildId: Snowflake, exists?: false): GuildConfig | undefined;
    // Get a guild configuration by its guild ID
    static getGuildConfig(guildId: Snowflake, exists?: boolean): GuildConfig | undefined {
        return exists
            ? ConfigManager.guildConfigs.get(guildId)!
            : ConfigManager.guildConfigs.get(guildId);
    }
}