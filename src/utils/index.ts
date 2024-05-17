import { Snowflake } from "discord-api-types/v10";
import { GuildBasedChannel, ThreadChannel } from "discord.js";
import { CronJobParams } from "@sentry/node/types/cron/cron";
import { Messages } from "./messages";
import { ObjectDiff } from "./types";
import { CronJob } from "cron";
import { prisma } from "./..";

import Logger, { AnsiColor } from "./logger";

import YAML from "yaml";
import _ from "lodash";
import fs from "fs";
import Sentry from "@sentry/node";

export function pluralize(count: number, singular: string, plural?: string): string {
    plural ??= `${singular}s`;
    return count === 1 ? singular : plural;
}

export function readYamlFile<T>(path: string): T {
    const raw = fs.readFileSync(path, "utf-8");
    return YAML.parse(raw);
}

export function cropLines(str: string, maxLines: number): string {
    const lines = str.split("\n");
    const lineCount = lines.length;
    const croppedLines = lines.slice(0, maxLines);

    if (lineCount > maxLines) {
        croppedLines.push(`(${lineCount - maxLines} more lines)`);
    }

    return croppedLines.join("\n");
}

// Stores cached messages and terminates the database connection
export async function handleProcessExit(event: string): Promise<void> {
    Logger.log(event, "Starting cleanup operations...", {
        color: AnsiColor.Red,
        full: true
    });

    try {
        await Messages.clear();
        await terminateDbConnection();
    } catch (error) {
        Logger.log(event, `Cleanup operations failed: ${error}`, {
            color: AnsiColor.Red,
            full: true
        });
    } finally {
        Logger.log(event, "Successfully completed cleanup operations", {
            color: AnsiColor.Red,
            full: true
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
    // Make sure both parameters are objects
    if (typeof oldObject !== "object" || typeof newObject !== "object") {
        throw new Error("Both arguments must be objects");
    }

    const difference: ObjectDiff = {};
    const keys = Object.keys(oldObject);

    for (const key of keys) {
        // Compare the values of the keys in the old and new objects
        if (!_.isEqual(oldObject[key], newObject[key])) {
            // Store old and new values in the difference object
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
export function humanizeTimestamp(ms: number): string {
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

export function elipsify(str: string, length: number): string {
    // Accounts for the length of the ellipsis
    const croppedStr = str.slice(0, length - 23);

    return str.length > length
        ? `${croppedStr}…(${str.length - croppedStr.length} more characters)`
        : str;
}

export function escapeInlineCode(str: string): string {
    return str.replaceAll("`", "``");
}

// Remove links and unnecessary whitespace from a string
export function stripLinks(str: string): string {
    return str
        // Remove links
        .replaceAll(/https?:\/\/[^\s\n\r]+/gi, "")
        // Remove purge log
        .replace(/ \(Purge log:.*/gi, "")
        // Remove unnecessary whitespace
        .replaceAll(/\s{2,}/g, " ");
}

export function startCronJob(monitorSlug: string, cronTime: CronJobParams["cronTime"], onTick: () => Promise<void> | void): void {
    const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, monitorSlug);

    CronJobWithCheckIn.from({
        cronTime,
        timeZone: "UTC",
        onTick: async () => {
            Logger.log(monitorSlug, "Running cron job...", {
                color: AnsiColor.Orange
            });

            await onTick();

            Logger.log(monitorSlug, "Successfully ran cron job", {
                color: AnsiColor.Orange
            });
        }
    }).start();

    Logger.log(monitorSlug, `Cron job started: ${cronTime}`, {
        color: AnsiColor.Orange
    });
}