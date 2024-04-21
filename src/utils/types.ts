import { ColorResolvable, Colors, InteractionReplyOptions } from "discord.js";

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

// Prisma generates "string" as the action type
// use "string" as the key to avoid the need for type casting
export const ActionEmbedColor: Record<string, ColorResolvable> = {
    [Action.Ban]: Colors.Blue,
    [Action.Unban]: Colors.Green,
    [Action.Kick]: Colors.Red,
    [Action.Mute]: Colors.Orange,
    [Action.Unmute]: Colors.Green,
    [Action.Note]: Colors.Yellow
};

// Mute duration in milliseconds
export enum MuteDuration {
    // 30 minutes
    Short = 1_800_000,
    // 1 hour
    Long = 3_600_000,
}

export enum Flag {
    // Infractions carried out using pre-set actions
    Quick = "Quick",
    // Infractions carried out by bots
    Automatic = "Automatic",
}

export type InteractionReplyData = InteractionReplyOptions | string | null;