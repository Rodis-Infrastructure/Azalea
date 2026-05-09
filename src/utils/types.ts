import { InteractionReplyOptions } from "discord.js";

export type ObjectDiff = Record<string | number | symbol, ObjectPropDiff>;

interface ObjectPropDiff {
    old: unknown;
    new: unknown;
}

// `ephemeral` is owned here (not inherited from discord.js's deprecated field).
// It's translated to `flags: MessageFlags.Ephemeral` at the dispatcher boundary.
export type CommandResponseOptions = Omit<InteractionReplyOptions, "ephemeral"> & {
    ephemeral?: boolean;
    temporary?: boolean;
};

export type CommandResponse = CommandResponseOptions | string | null;
export type Result<T = undefined> =
    | { ok: false, message: string }
    | { ok: true } & (T extends undefined ? { data?: never } : { data: T });