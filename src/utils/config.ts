import { Snowflake } from "discord-api-types/v10";
import { readYamlFile } from "./index.ts";
import { Collection, Guild } from "discord.js";
import { client } from "../index.ts";

import _ from "lodash";
import fs from "fs";

export class ConfigManager {
    private static guildConfigs = new Collection<Snowflake, GuildConfig>();
    static globalConfig: GlobalConfig;

    // Initialize the config manager by loading all configs from the configs directory
    static async loadGuildConfigs() {
        const files = fs.readdirSync("configs")
            .filter(file => file !== "example.yml");

        for (const file of files) {
            const [guildId] = file.split(".");

            const parsedConfig = readYamlFile(`configs/${file}`);
            const config = await setConfigDefaults(guildId, parsedConfig);

            ConfigManager.addGuildConfig(guildId, config);
        }
    }

    static loadGlobalConfig() {
        ConfigManager.globalConfig = readYamlFile<GlobalConfig>("azalea.cfg.yml");
    }

    static addGuildConfig(guildId: Snowflake, config: GuildConfig): GuildConfig {
        return ConfigManager.guildConfigs.set(guildId, config).first()!;
    }

    static getGuildConfig(guildId: Snowflake): GuildConfig | undefined {
        return ConfigManager.guildConfigs.get(guildId);
    }
}

async function setConfigDefaults(guildId: Snowflake, data: unknown): Promise<GuildConfig> {
    const guild = await client.guilds.fetch(guildId).catch(() => {
        throw new Error("Failed to load config, unknown guild ID");
    });

    const scopingDefaults: Scoping = {
        include_channels: [],
        exclude_channels: [],
        include_roles: []
    }

    const configDefaults: GuildConfig = {
        guild,
        logging: {
            default_scoping: scopingDefaults,
            logs: []
        }
    }

    const config: GuildConfig = _.defaultsDeep(data, configDefaults);

    for (const log of config.logging.logs) {
        log.scoping = _.defaultsDeep(log.scoping, scopingDefaults);
    }

    return config;
}

export interface Scoping {
    include_channels: Snowflake[];
    exclude_channels: Snowflake[];
    include_roles: Snowflake[];
}

interface Log {
    events: LoggingEvent[];
    channel_id: Snowflake;
    scoping: Scoping;
}

interface Logging {
    default_scoping: Scoping;
    logs: Log[];
}

export interface GuildConfig {
    logging: Logging;
    guild: Guild;
}

interface Database {
    messages: Messages;
}

interface Messages {
    insert_crud: string;
    delete_crud: string;
}

export interface GlobalConfig {
    database: Database;
}

export enum LoggingEvent {
    MessageDelete = "message_delete",
    MessageUpdate = "message_update",
    ReactionAdd = "reaction_add"
}