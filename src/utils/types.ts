export type AbstractInstanceType<T> = T extends { prototype: infer U } ? U : never;
export type ObjectDiff = Record<string | number | symbol, ObjectPropDiff>;

interface ObjectPropDiff {
    old: unknown;
    new: unknown;
}