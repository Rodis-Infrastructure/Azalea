import { Snowflake } from "discord-api-types/v10";
import { Collection } from "discord.js";

import YAML from "yaml";
import fs from "fs";

export class ConfigManager {
    private static instances = new Collection<Snowflake, Config>();

    // Initialize the config manager by loading all configs from the configs directory
    static seedConfigs() {
        const files = fs.readdirSync("configs")
            .filter(file => file !== "example.yml");

        for (const file of files) {
            const [guildId] = file.split(".");

            const rawConfig = fs.readFileSync(`configs/${file}`, "utf-8");
            const parsedConfig: Config = YAML.parse(rawConfig);
            const config = fillConfig(parsedConfig);

            ConfigManager.addConfig(guildId, config);
        }
    }

    static addConfig(guildId: Snowflake, config: Config): Config {
        return ConfigManager.instances.set(guildId, config).first()!;
    }

    static getConfig(guildId: Snowflake): Config | undefined {
        return ConfigManager.instances.get(guildId);
    }
}

// Fill in any missing config values with defaults
function fillConfig(config: Config): Config {
    return {
        logging: {
            logs: config.logging.logs,
            default_scoping: config.logging.default_scoping ?? {
                include_channels: [],
                exclude_channels: [],
                include_roles: []
            }
        }
    }
}

export interface Scoping {
    include_channels: Snowflake[];
    exclude_channels: Snowflake[];
    include_roles: Snowflake[];
}

interface Log {
    events: LoggingEvent[];
    channel_id: Snowflake;
    scoping?: Scoping;
}

interface Logging {
    default_scoping: Scoping;
    logs: Log[];
}

export interface Config {
    logging: Logging;
}

export enum LoggingEvent {
    MessageDelete = "message_delete"
}