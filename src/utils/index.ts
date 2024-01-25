import { Snowflake } from "discord-api-types/v10";
import { GuildBasedChannel, ThreadChannel } from "discord.js";
import { MessageCache } from "./messages.ts";
import { ObjectDiff } from "./types.ts";
import { prisma } from "../index.ts";

import Logger, { AnsiColor } from "./logger.ts";

import YAML from "yaml";
import _ from "lodash";
import fs from "fs";

export function pluralize(count: number, singular: string, plural?: string): string {
    plural ??= `${singular}s`;
    return count === 1 ? singular : plural;
}

export function readYamlFile<T>(path: string): T {
    const raw = fs.readFileSync(path, "utf-8");
    return YAML.parse(raw);
}

// Stores cached messages and terminates the database connection
export async function handleProcessExit(event: string): Promise<void> {
    Logger.log(event, "Starting cleanup operations...", {
        color: AnsiColor.Red,
        fullColor: true
    });

    try {
        await MessageCache.clear();
        await terminateDbConnection();
    } catch (error) {
        Logger.log(event, `Cleanup operations failed: ${error}`, {
            color: AnsiColor.Red,
            fullColor: true
        });
    } finally {
        Logger.log(event, "Successfully completed cleanup operations", {
            color: AnsiColor.Red,
            fullColor: true
        });
    }

    process.exit(0);
}

async function terminateDbConnection(): Promise<void> {
    Logger.info("Terminating database connection...");

    await prisma.$disconnect()
        .then(() => {
            Logger.info("Successfully disconnected from database");
        });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getObjectDiff(oldObject: any, newObject: any): ObjectDiff {
    if (typeof oldObject !== "object" || typeof newObject !== "object") {
        throw new Error("Both arguments must be objects");
    }

    const difference: ObjectDiff = {};
    const keys = Object.keys(oldObject);

    for (const key of keys) {
        if (!_.isEqual(oldObject[key], newObject[key])) {
            difference[key] = {
                old: oldObject[key],
                new: newObject[key]
            };
        }
    }

    return difference;
}

export function userMentionWithId(id: Snowflake): `<@${Snowflake}> (\`${Snowflake}\`)` {
    return `<@${id}> (\`${id}\`)`;
}

export function channelMentionWithName(channel: GuildBasedChannel | ThreadChannel): `<#${Snowflake}> (\`#${string}\`)` {
    return `<#${channel.id}> (\`#${channel.name}\`)`;
}

// @returns {string} The string representation of the given number of milliseconds (e.g. 300000 = "5 minutes")
export function msToString(ms: number): string {
    const units = [
        { unit: "day", value: 24 * 60 * 60 * 1000 },
        { unit: "hour", value: 60 * 60 * 1000 },
        { unit: "minute", value: 60 * 1000 }
    ];

    return units
        .map(({ unit, value }) => {
            const count = Math.floor(ms / value);
            ms %= value;
            return count && `${count} ${pluralize(count, unit)}`;
        })
        .filter(Boolean)
        .join(" ") || "< 1 minute";
}