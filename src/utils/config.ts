import { Snowflake } from "discord-api-types/v10";
import { readYamlFile } from "./index.ts";
import { Collection, Guild, GuildBasedChannel } from "discord.js";
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
            const config = await setGuildConfigDefaults(guildId, parsedConfig);

            validateGuildConfig(config);
            this.addGuildConfig(guildId, config);
        }
    }

    static loadGlobalConfig(): void {
        this.globalConfig = readYamlFile<GlobalConfig>("azalea.cfg.yml");
    }

    static addGuildConfig(guildId: Snowflake, config: GuildConfig): GuildConfig {
        return this.guildConfigs.set(guildId, config).first()!;
    }

    static getGuildConfig(guildId: Snowflake, exists: true): GuildConfig;
    static getGuildConfig(guildId: Snowflake, exists?: false): GuildConfig | undefined;
    static getGuildConfig(guildId: Snowflake, exists?: boolean): GuildConfig | undefined {
        return exists
            ? this.guildConfigs.get(guildId)!
            : this.guildConfigs.get(guildId);
    }
}

async function setGuildConfigDefaults(guildId: Snowflake, data: unknown): Promise<GuildConfig> {
    const guild = await client.guilds.fetch(guildId).catch(() => {
        throw new Error("Failed to load config, unknown guild ID");
    });

    const channelScopingDefaults: ChannelScoping = {
        include_channels: [],
        exclude_channels: []
    };

    const configDefaults: GuildConfig = {
        guild,
        default_purge_amount: 100,
        ephemeral_scoping: channelScopingDefaults,
        logging: {
            default_scoping: channelScopingDefaults,
            logs: []
        }
    };

    const config: GuildConfig = _.defaultsDeep(data, configDefaults);

    for (const log of config.logging.logs) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!log.scoping) {
            log.scoping = config.logging.default_scoping;
        } else {
            log.scoping = _.defaultsDeep(log.scoping, channelScopingDefaults);
        }
    }

    return config;
}

function validateGuildConfig(config: GuildConfig): void {
    if (config.default_purge_amount < 1 || config.default_purge_amount > 100) {
        throw new Error("Invalid default purge amount, the value must be between 1 and 100 (inclusive)");
    }

    if (!Number.isInteger(config.default_purge_amount)) {
        throw new Error("Invalid default purge amount, the value must be an integer");
    }
}

export function inScope(scoping: ChannelScoping, channel: GuildBasedChannel): boolean {
    const data: ChannelScopingParams = {
        categoryId: channel.parentId,
        channelId: channel.id,
        threadId: null
    };

    if (channel.isThread() && channel.parent) {
        data.channelId = channel.parent.id;
        data.threadId = channel.id;
        data.categoryId = channel.parent.parentId;
    }

    return channelIsIncluded(scoping, data) && !channelIsExcluded(scoping, data);
}

function channelIsIncluded(scoping: ChannelScoping, channelData: ChannelScopingParams): boolean {
    const { channelId, threadId, categoryId } = channelData;

    return scoping.include_channels.length === 0
        || scoping.include_channels.includes(channelId)
        || (threadId !== null && scoping.include_channels.includes(threadId))
        || (categoryId !== null && scoping.include_channels.includes(categoryId));
}

function channelIsExcluded(scoping: ChannelScoping, channelData: ChannelScopingParams): boolean {
    const { channelId, threadId, categoryId } = channelData;

    return scoping.exclude_channels.includes(channelId)
        || (threadId !== null && scoping.exclude_channels.includes(threadId))
        || (categoryId !== null && scoping.exclude_channels.includes(categoryId));
}

export interface ChannelScoping {
    include_channels: Snowflake[];
    exclude_channels: Snowflake[];
}

interface ChannelScopingParams {
    channelId: Snowflake;
    threadId: Snowflake | null;
    categoryId: Snowflake | null;
}

interface Log {
    events: LoggingEvent[];
    channel_id: Snowflake;
    scoping: ChannelScoping;
}

interface Logging {
    default_scoping: ChannelScoping;
    logs: Log[];
}

export interface GuildConfig {
    logging: Logging;
    ephemeral_scoping: ChannelScoping;
    // Value must be between 1 and 100 (inclusive) - Default: 100
    default_purge_amount: number;
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
    MessageBulkDelete = "message_bulk_delete",
    MessageDelete = "message_delete",
    MessageUpdate = "message_update",
    MessageReactionAdd = "message_reaction_add",
    InteractionCreate = "interaction_create",
    VoiceJoin = "voice_join",
    VoiceLeave = "voice_leave",
    VoiceSwitch = "voice_switch",
    ThreadCreate = "thread_create",
    ThreadDelete = "thread_delete",
    ThreadUpdate = "thread_update",
    MediaStore = "media_store",
    // TODO
    InfractionCreate = "infraction_create",
    // TODO
    InfractionArchive = "infraction_archive",
    // TODO
    InfractionUpdate = "infraction_update",
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
    MessageReportResolve = "message_report_resolve"
}