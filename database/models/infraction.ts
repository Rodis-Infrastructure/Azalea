import { Snowflake } from "discord.js";

export interface InfractionModel {
    infraction_id: number;
    target_id: Snowflake;
    request_author_id?: Snowflake;
    updated_by?: Snowflake;
    archived_by?: Snowflake;
    archived_at?: number;
    updated_at?: number;
    executor_id: Snowflake;
    created_at: number;
    expires_at?: number;
    action: PunishmentType;
    flag?: InfractionFlag;
    reason?: string;
}

export interface InfractionCount {
    note: number;
    mute: number;
    kick: number;
    ban: number;
}

export enum PunishmentType {
    Note = 1,
    Mute = 2,
    Kick = 3,
    Ban = 4,
    Unban = 5,
    Unmute = 6
}

export enum InfractionFlag {
    /** Infraction given by bot */
    Automatic = 1,
    /** Infraction given using pre-set values (such as duration) */
    Quick = 2
}

/** Primarily used for infraction searches */
export type MinimalInfraction = Omit<InfractionModel, "updated_by" | "updated_at" | "request_author_id">

export enum InfractionFilter {
    All = "All",
    Automatic = "Automatic",
    Archived = "Archived",
}

export type InfractionResolveOptions = {
    executorId: Snowflake,
    targetId: Snowflake,
    guildId: Snowflake,
    requestAuthorId?: Snowflake,
    flag?: InfractionFlag,
    reason?: string | null
} & ({
    punishment: PunishmentType.Mute,
    duration: number
} | {
    punishment: Exclude<PunishmentType, PunishmentType.Mute>,
    duration?: never
});