import { InteractionReplyOptions } from "discord.js";

export type AbstractInstanceType<T> = T extends { prototype: infer U } ? U : never;
export type ObjectDiff = Record<string | number | symbol, ObjectPropDiff>;

interface ObjectPropDiff {
    old: unknown;
    new: unknown;
}

export enum Action {
    Ban = "Ban",
    Unban = "Unban",
    Kick = "Kick",
    Mute = "Mute",
    Unmute = "Unmute",
    Note = "Note",
}

export enum Flag {
    // Infractions carried out using pre-set actions
    Quick = "Quick",
    // Infractions carried out by bots
    Automatic = "Automatic",
}

export type InteractionReplyData = InteractionReplyOptions | string | null;

export type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
};