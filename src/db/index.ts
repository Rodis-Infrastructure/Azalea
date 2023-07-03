import { Database } from "sqlite3";
import { Infraction, InfractionAction, InfractionFlag } from "../utils/Types";
import { stringify } from "../utils";

import ClientManager from "../Client";
import * as process from "process";

if (!process.env.DB_PATH) throw new Error("No database path provided");
const conn = new Database(process.env.DB_PATH);

export function runQuery(query: string): Promise<void> {
    return new Promise((resolve, reject) => {
        conn.run(query, err => {
            if (err) reject(err);
            resolve();
        });
    });
}

export function getQuery<T, N extends boolean = false>(query: string): Promise<N extends true ? T : T | null> {
    return new Promise((resolve, reject) => {
        conn.get(query, (err, row: T) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

export function allQuery<T>(query: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
        conn.all(query, (err, rows: T[]) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
}

export async function storeInfraction(data: {
    executorId: string;
    targetId: string;
    infractionType: InfractionAction;
    guildId: string;
    requestAuthorId?: string;
    expiresAt?: number | null;
    flag?: InfractionFlag;
    reason?: string | null;
}) {
    const { guildId, executorId, targetId, infractionType, requestAuthorId, expiresAt, flag, reason } = data;

    // @formatter:off
    // Stringified parameters are optional
    const infraction = await getQuery<Pick<Infraction, "infractionId" | "createdAt">>(`
        INSERT INTO infractions (
            guildId,
            executorId,
            targetId,
            action,
            requestAuthorId,
            expiresAt,
            flag,
            reason
        )
        VALUES (
            '${guildId}', 
            '${executorId}', 
            '${targetId}', 
            ${infractionType}, 
            ${stringify(requestAuthorId)},
            ${expiresAt || null}, 
            ${flag || null},
            ${stringify(reason)}
        )
        RETURNING infractionId, createdAt;
    `);

    // @formatter:on
    if (infraction) {
        if (infractionType === InfractionAction.Mute) ClientManager.cache.activeMutes.set(targetId, infraction.infractionId);
        const { data: infractions } = ClientManager.cache.infractions.get(targetId) || {};

        infractions?.push({
            infractionId: infraction.infractionId,
            executorId,
            action: infractionType,
            expiresAt: expiresAt || undefined,
            createdAt: infraction.createdAt,
            deletedAt: undefined,
            deletedBy: undefined,
            reason: reason || undefined,
            flag
        });
    }
}