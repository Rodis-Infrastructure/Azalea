import { getRequestContext } from "./requestContext";

interface ColorOptions {
    // ANSI color code
    color?: AnsiColor;
    // Whether to color the full log or just the level
    full?: boolean;
}

export enum AnsiColor {
    Purple = "\x1b[35m",
    Green = "\x1b[32m",
    Orange = "\x1b[38;5;208m",
    Yellow = "\x1b[33m",
    Reset = "\x1b[0m",
    Cyan = "\x1b[36m",
    Grey = "\x1b[90m",
    Red = "\x1b[31m"
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogMeta {
	[key: string]: unknown;
}

const LEVEL_NUMERIC: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40
};

function resolveLogLevel(): LogLevel {
	const raw = process.env.LOG_LEVEL?.toLowerCase();
	if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
	return "info";
}

function resolveLogFormat(): "text" | "json" {
	const raw = process.env.LOG_FORMAT?.toLowerCase();
	if (raw === "json") return "json";
	return "text";
}

const RESOLVED_LEVEL = resolveLogLevel();
const RESOLVED_FORMAT = resolveLogFormat();
// Strip ANSI when stdout is a file (PM2, CI, journalctl, container logs).
// ANSI escapes break log search and aggregator parsing in those contexts.
const COLORS_ENABLED = RESOLVED_FORMAT === "text" && Boolean(process.stdout.isTTY);

function shouldEmit(level: LogLevel): boolean {
	return LEVEL_NUMERIC[level] >= LEVEL_NUMERIC[RESOLVED_LEVEL];
}

function coerceMessage(value: unknown): string {
	if (typeof value === "string") return value;
	if (value instanceof Error) return value.stack ?? value.message;
	return String(value);
}

function emit(
	level: LogLevel,
	tag: string,
	message: unknown,
	meta?: LogMeta,
	options?: ColorOptions
): void {
	if (!shouldEmit(level)) return;

	const timestamp = new Date().toISOString();
	const messageString = coerceMessage(message);
	// Caller-supplied meta overrides ambient context — keeps a per-call
	// `guild_id` from being silently overwritten by the request's.
	const ctx = getRequestContext();
	const enriched = ctx || meta ? { ...ctx, ...meta } : undefined;

	if (RESOLVED_FORMAT === "json") {
		const record: Record<string, unknown> = {
			timestamp,
			level,
			tag,
			message: messageString,
			...enriched
		};
		console.log(JSON.stringify(record));
		return;
	}

	const tsString = COLORS_ENABLED
		? `${AnsiColor.Grey}[${timestamp}]${AnsiColor.Reset}`
		: `[${timestamp}]`;

	let body: string;
	if (COLORS_ENABLED && options?.color) {
		body = options.full
			? `${options.color}[${tag}] ${messageString}${AnsiColor.Reset}`
			: `${options.color}[${tag}]${AnsiColor.Reset} ${messageString}`;
	} else {
		body = `[${tag}] ${messageString}`;
	}

	const metaString = enriched && Object.keys(enriched).length > 0
		? ` ${JSON.stringify(enriched)}`
		: "";

	console.log(`${tsString} ${body}${metaString}`);
}

export default class Logger {
	// Generic overload — preserves the long-standing scope-tag usage,
	// e.g. `Logger.log("MUTE_REQUEST_REVIEW_REMINDER", "Cron job started…")`.
	// Always emits at info level; gated by `LOG_LEVEL`.
	static log(tag: string, message: string, options?: ColorOptions): void {
		emit("info", tag, message, undefined, options);
	}

	static debug(message: string, meta?: LogMeta): void {
		emit("debug", "DEBUG", message, meta, { color: AnsiColor.Grey });
	}

	static info(message: string, meta?: LogMeta): void {
		emit("info", "INFO", message, meta, { color: AnsiColor.Cyan });
	}

	static warn(message: string, meta?: LogMeta): void {
		emit("warn", "WARN", message, meta, { color: AnsiColor.Yellow });
	}

	static error(message: unknown, meta?: LogMeta): void {
		emit("error", "ERROR", message, meta, { color: AnsiColor.Red });
	}
}
