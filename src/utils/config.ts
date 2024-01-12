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

    static getGuildConfig(guildId: Snowflake, exists: true): GuildConfig;
    static getGuildConfig(guildId: Snowflake, exists?: false): GuildConfig | undefined;
    static getGuildConfig(guildId: Snowflake, exists?: boolean): GuildConfig | undefined {
        return exists
            ? ConfigManager.guildConfigs.get(guildId)!
            : ConfigManager.guildConfigs.get(guildId);
    }
}

export async function setConfigDefaults(guildId: Snowflake, data: unknown): Promise<GuildConfig> {
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
    MessageBulkDelete = "message_bulk_delete",
    MessageDelete = "message_delete",
    MessageUpdate = "message_update",
    MessageReactionAdd = "message_reaction_add",
    InfractionCreate = "infraction_create",
    InfractionDelete = "infraction_delete",
    InfractionUpdate = "infraction_update",
    InteractionCreate = "interaction_create",
    VoiceJoin = "voice_join",
    VoiceLeave = "voice_leave",
    VoiceMove = "voice_move",
    ThreadCreate = "thread_create",
    ThreadDelete = "thread_delete",
    ThreadUpdate = "thread_update",
    BanRequestApprove = "ban_request_approve",
    BanRequestDeny = "ban_request_deny",
    MuteRequestApprove = "mute_request_approve",
    MuteRequestDeny = "mute_request_deny",
    MessageReportCreate = "message_report_create",
    MessageReportResolve = "message_report_resolve",
    MediaStore = "media_store",
    Ready = "ready"
}