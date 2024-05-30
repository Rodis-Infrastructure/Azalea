import { Snowflake } from "discord-api-types/v10";
import { GuildBasedChannel, ThreadChannel } from "discord.js";
import { CronJobParams } from "@sentry/node/types/cron/cron";
import { Messages } from "./messages";
import { ObjectDiff } from "./types";
import { CronJob } from "cron";
import { prisma } from "./..";
import { DEFAULT_TIMEZONE } from "./constants";

import Logger, { AnsiColor } from "./logger";

import YAML from "yaml";
import _ from "lodash";
import fs from "fs";
import Sentry from "@sentry/node";

/**
 * Pluralizes a word based on the given count
 *
 * @param count - The count to determine the plural form
 * @param singular - The singular form of the word
 * @param plural - The plural form of the word, defaults to `{singular}s`
 * @returns The pluralized word
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
    return count === 1 ? singular : plural;
}

/**
 * Reads a YAML file from the given path and returns the parsed content
 *
 * @param path - The path to the YAML file
 * @template Value - The type of the parsed content
 * @returns {Value} The parsed content of the YAML file
 */
export function readYamlFile<Value>(path: string): Value {
    const raw = fs.readFileSync(path, "utf-8");
    return YAML.parse(raw);
}

/**
 * Crops a string to a maximum number of lines.
 *
 * - Appends the number of lines cropped if the string exceeds the maximum number of lines.
 *
 * @param str - The string to crop
 * @param maxLines - The maximum number of lines to keep
 * @returns The cropped string
 */
export function cropLines(str: string, maxLines: number): string {
    const lines = str.split("\n");
    const lineCount = lines.length;
    const croppedLines = lines.slice(0, maxLines);
    const diff = lineCount - maxLines;

    if (diff > 0) {
        croppedLines.splice(-1, 1, `(${diff} more ${pluralize(diff, "line")})`);
    }

    return croppedLines.join("\n");
}

/**
 * Starts cleanup operations when the bot is shut down
 *
 * - Clears the message cache by storing the messages in the database
 * - Disconnects from the database
 * - Logs the process
 *
 * @param event - The event that triggered the cleanup operations
 */
export async function startCleanupOperations(event: string): Promise<void> {
    Logger.log(event, "Starting cleanup operations...", {
        color: AnsiColor.Red,
        full: true
    });

    try {
        await Messages.store();
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

// Disconnect from the database and log the process
async function terminateDbConnection(): Promise<void> {
    Logger.info("Terminating database connection...");

    await prisma.$disconnect()
        .then(() => {
            Logger.info("Successfully disconnected from database");
        });
}

/**
 * Compares two objects and returns the differences between them
 *
 * @param oldObject - The old state of the object
 * @param newObject - The new state of the object
 * @returns The differences between the two states of the object
 * @throws Error - If either of the arguments is not an object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getObjectDiff(oldObject: any, newObject: any): ObjectDiff {
    const paramsAreObjects = typeof oldObject === "object" && typeof newObject === "object";
    const paramsAreNotNull = oldObject !== null && newObject !== null;

    // Make sure both parameters are valid
    if (!paramsAreObjects || !paramsAreNotNull) {
        throw new Error("Both parameters must be non-null objects");
    }

    const differences: ObjectDiff = {};
    const keys = Object.keys(oldObject);

    for (const key of keys) {
        // Compare the values of the keys in the old and new objects
        if (!_.isEqual(oldObject[key], newObject[key])) {
            // Store the differences
            differences[key] = {
                old: oldObject[key],
                new: newObject[key]
            };
        }
    }

    return differences;
}

// Mentions a user with its ID, making the ID easier to copy on desktop
export function userMentionWithId(id: Snowflake): `<@${Snowflake}> (\`${Snowflake}\`)` {
    return `<@${id}> (\`${id}\`)`;
}

// Mentions a channel with its ID and name, may be used in scenarios where the channel may be deleted
export function channelMentionWithName(channel: GuildBasedChannel | ThreadChannel): `<#${Snowflake}> (\`#${string}\`)` {
    return `<#${channel.id}> (\`#${channel.name}\`)`;
}

/**
 * Converts milliseconds to a human-readable string
 *
 * - Only the following units are used: days, hours, minutes
 * - The string is formatted as "{count} {unit}" (e.g. "5 minutes")
 * - If the number of milliseconds is below 1 minute, "< 1 minute" is returned
 *
 * @param ms - The number of milliseconds to humanize
 * @returns The string representation of the given number of milliseconds (e.g. 300000 = "5 minutes")
 */
export function humanizeTimestamp(ms: number): string {
    const units = [
        { unit: "day", value: 24 * 60 * 60 * 1000 },
        { unit: "hour", value: 60 * 60 * 1000 },
        { unit: "minute", value: 60 * 1000 }
    ];

    return units
        .map(({ unit, value }) => {
            const count = Math.round(ms / value);
            const isInRange = count > 0 && count < 60;
            ms %= value;
            return isInRange && `${count} ${pluralize(count, unit)}`;
        })
        .filter(Boolean)
        .join(" ") || "< 1 minute";
}

/**
 * Crops a string if it exceeds the given length
 *
 * @param str - The string to crop
 * @param maxLength - The maximum length of the string
 * @returns The cropped string (if it exceeds the maximum length)
 */
export function elipsify(str: string, maxLength: number): string {
    // Accounts for the length of the ellipsis
    const croppedStr = str.slice(0, maxLength - 23);

    return str.length > maxLength
        ? `${croppedStr}…(${str.length - croppedStr.length} more characters)`
        : str;
}

/**
 * Formats the infraction reason to appended to a confirmation response
 *
 * - Removes backticks since they cannot be escaped and clash with the applied format
 * - Wraps the reason in inline code and parentheses: (\`{reason}\`)
 *
 * @param reason - The reason to format
 */
export function formatInfractionReason(reason: string): string {
    const cleanReason = reason.replaceAll("`", "");
    return `(\`${cleanReason}\`)`;
}

/**
 * Cleans the reason by removing...
 *
 * - Links
 * - Purge logs (format: `(Purge log: ...)`)
 * - Unnecessary whitespace
 *
 * @param reason - The reason to clean
 * @returns The clean reason
 */
export function formatInfractionReasonPreview(reason: string): string {
    return reason
        // Remove links
        .replaceAll(/https?:\/\/[^\s\n\r]+/gi, "")
        // Remove purge log
        .replace(/ \(Purge log:.*/gi, "")
        // Remove unnecessary whitespace
        .replaceAll(/\s{2,}/g, " ")
        .trim();
}

/**
 * Starts a cron job with the given parameters
 *
 * - Tracks the cron job with Sentry
 * - Logs the start of the cron job
 * - Logs each tick of the cron job
 *
 * @param monitorSlug - The slug of the monitor
 * @param cronTime - The cron time string (timezone: {@link DEFAULT_TIMEZONE})
 * @param onTick - The function to run on each tick
 */
export function startCronJob(monitorSlug: string, cronTime: CronJobParams["cronTime"], onTick: () => Promise<void> | void): void {
    const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob, monitorSlug);

    CronJobWithCheckIn.from({
        cronTime,
        timeZone: DEFAULT_TIMEZONE,
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

/**
 * Returns the URL to preview a file's content in a browser.
 * Uses `https://discord-fv.vercel.app/?url={fileUrl}` to preview the file content.
 *
 * @param url - The URL of the file to preview
 * @returns The URL to preview the file content
 */
export function getFilePreviewUrl(url: string): string {
    return `https://discord-fv.vercel.app/?url=${encodeURIComponent(url)}`;
}