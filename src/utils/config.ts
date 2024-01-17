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
    static async loadGuildConfigs(): Promise<void> {
        const files = fs.readdirSync("configs")
            .filter(file => file !== "example.yml");

        for (const file of files) {
            const [guildId] = file.split(".");

            const parsedConfig = readYamlFile(`configs/${file}`);
            const config = await setConfigDefaults(guildId, parsedConfig);

            ConfigManager.addGuildConfig(guildId, config);
        }
    }

    static loadGlobalConfig(): void {
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

    const emptyScoping: Scoping = {
        include_channels: [],
        exclude_channels: [],
        include_roles: []
    };

    const configDefaults: GuildConfig = {
        guild,
        logging: {
            default_scoping: emptyScoping,
            logs: []
        }
    };

    const config: GuildConfig = _.defaultsDeep(data, configDefaults);

    for (const log of config.logging.logs) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!log.scoping) {
            log.scoping = config.logging.default_scoping;
        } else {
            log.scoping = _.defaultsDeep(log.scoping, emptyScoping);
        }
    }

    return config;
}

export type Scoping = RoleScoping & ChannelScoping;

interface RoleScoping {
    include_roles: Snowflake[];
}

interface ChannelScoping {
    include_channels: Snowflake[];
    exclude_channels: Snowflake[];
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
    insert_cron: string;
    delete_cron: string;
}

export interface GlobalConfig {
    database: Database;
}

export enum LoggingEvent {
    // TODO
    MessageBulkDelete = "message_bulk_delete",
    MessageDelete = "message_delete",
    MessageUpdate = "message_update",
    MessageReactionAdd = "message_reaction_add",
    // TODO
    InfractionCreate = "infraction_create",
    // TODO
    InfractionDelete = "infraction_delete",
    // TODO
    InfractionUpdate = "infraction_update",
    InteractionCreate = "interaction_create",
    // TODO
    VoiceJoin = "voice_join",
    // TODO
    VoiceLeave = "voice_leave",
    // TODO
    VoiceMove = "voice_move",
    // TODO
    ThreadCreate = "thread_create",
    // TODO
    ThreadDelete = "thread_delete",
    // TODO
    ThreadUpdate = "thread_update",
    // TODO
    BanRequestApprove = "ban_request_approve",
    // TODO
    BanRequestDeny = "ban_request_deny",
    // TODO
    MuteRequestApprove = "mute_request_approve",
    // TODO
    MuteRequestDeny = "mute_request_deny",
    // TODO
    MessageReportCreate = "message_report_create",
    // TODO
    MessageReportResolve = "message_report_resolve",
    // TODO
    MediaStore = "media_store",
    // TODO
    Ready = "ready"
}