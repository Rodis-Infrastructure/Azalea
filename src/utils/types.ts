import { InteractionReplyOptions } from "discord.js";

export type ObjectDiff = Record<string | number | symbol, ObjectPropDiff>;

interface ObjectPropDiff {
    old: unknown;
    new: unknown;
}

export type InteractionReplyData = InteractionReplyOptions & Partial<Record<"temporary", boolean>> | string | null;
export type Result<T = undefined> =
    | { success: false, message: string }
    | { success: true } & (T extends undefined ? { data?: never } : { data: T });