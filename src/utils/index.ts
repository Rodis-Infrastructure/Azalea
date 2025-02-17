import {
	GuildBasedChannel,
	Role,
	ThreadChannel,
	TextBasedChannel,
	cleanContent as djsCleanContent,
	User,
	GuildMember
} from "discord.js";

import { Snowflake } from "discord-api-types/v10";
import { Messages } from "./messages";
import { ObjectDiff } from "./types";
import { CronJob, CronJobParams } from "cron";
import { prisma } from "./..";
import { DEFAULT_TIMEZONE } from "./constants";
import { cron } from "@sentry/node";

import Logger, { AnsiColor } from "./logger";
import YAML from "yaml";
import _ from "lodash";
import fs from "fs";

/**
 * Pluralizes a word based on the given count
 *
 * @param count - The count used to determine the plural form
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
 * @template T - The type of the parsed content
 * @returns {T} The parsed content of the YAML file
 */
export function readYamlFile<T>(path: string): T {
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
	const diff = lines.length - maxLines;

	if (diff > 0) {
		const croppedLines = lines.slice(0, maxLines - 1);
		croppedLines.push(`(${diff} more ${pluralize(diff, "line")})`);

		return croppedLines.join("\n");
	}

	return str;
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
		return;
	}

	Logger.log(event, "Successfully completed cleanup operations", {
		color: AnsiColor.Red,
		full: true
	});

	process.exit(0);
}

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

	if (!paramsAreObjects || !paramsAreNotNull) {
		throw new Error("Both parameters must be non-null objects");
	}

	const differences: ObjectDiff = {};
	const keys = Object.keys(oldObject);

	for (const key of keys) {
		if (!_.isEqual(oldObject[key], newObject[key])) {
			differences[key] = {
				old: oldObject[key],
				new: newObject[key]
			};
		}
	}

	return differences;
}

export function userMentionWithId(id: Snowflake): `<@${Snowflake}> (\`${Snowflake}\`)` {
	return `<@${id}> (\`${id}\`)`;
}

export function channelMentionWithName(channel: GuildBasedChannel | ThreadChannel): `<#${Snowflake}> (\`#${string}\`)` {
	return `<#${channel.id}> (\`#${channel.name}\`)`;
}

export function roleMentionWithName(role: Role): `<@&${Snowflake}> (\`@${string}\`)` {
	return `<@&${role.id}> (\`@${role.name}\`)`;
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
			const count = Math.floor(ms / value);
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
	if (str.length > maxLength) {
		const croppedStr = str.slice(0, maxLength - 23);
		return `${croppedStr}…(${str.length - croppedStr.length} more characters)`;
	}

	return str;
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
	const cronJobWithCheckIn = cron.instrumentCron(CronJob, monitorSlug);

	cronJobWithCheckIn.from({
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
 * Uses `https://discord-fv.vercel.app/?url={fileURL}` to preview the file content.
 *
 * @param url - The URL of the file to preview
 * @returns The URL to preview the file content
 */
export function getFilePreviewURL(url: string): string {
	return `https://discord-fv.vercel.app/?url=${encodeURIComponent(url)}`;
}

/**
 * Generates a random number in the given range (inclusive)
 *
 * @param max - The maximum value of the random integer
 * @param min - The minimum value of the random integer
 * @returns A random integer between the given range
 */
export function randInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function cleanContent(str: string, channel: TextBasedChannel): string {
	// Escape custom emojis
	str = str.replace(/<(a?):([^:\n\r]+):(\d{17,19})>/g, "<$1\\:$2\\:$3>");
	// Add IDs to mentions
	str = str.replace(/<@!?(\d{17,19})>/g, `<@$1> ($1)`);
	return djsCleanContent(str, channel);
}

/**
 * Get the name of a user that is on the surface level.
 * The following order is used:
 *
 * 1. Server nickname
 * 2. Global display name
 * 3. Username (returned as @username)
 *
 * @param member - The guild member or user to get the surface name of
 * @returns The user's surface name
 */
export function getSurfaceName(member: GuildMember | User): string {
	// The displayName getter works in the following order:
	// guild nickname OR global name OR username
	const displayName = member.displayName;
	const username = member instanceof GuildMember
		? member.user.username
		: member.username;

	if (username === displayName) {
		return `@${username}`;
	}

	return `@${username} | ${displayName}`;
}

/**
 * Stringifies an object to JSON with BigInt support
 *
 * @param obj - The object to stringify
 * @param space - The number of spaces to use for indentation
 * @returns The JSON stringified object
 */
export function stringifyJSON(obj: unknown, space = 2): string {
	return JSON.stringify(obj, (_, v) => {
		return typeof v === "bigint" ? v.toString() : v;
	}, space);
}

export function stringifyPositionalNum(num: number): string {
	const numStr = num.toLocaleString();
	const lastDigit = numStr[numStr.length - 1];

	switch (lastDigit) {
		case "1":
			return `${numStr}st`;
		case "2":
			return `${numStr}nd`;
		case "3":
			return `${numStr}rd`;
		default:
			return `${numStr}th`;
	}
}

export function formatEmojiUrl(id: Snowflake): string {
	return `https://cdn.discordapp.com/emojis/${id}.webp?size=320`;
}