import { redactSecrets } from "./secrets";

/**
 * Application-level error classes. Throw these (or sub-class them) when
 * the bot has a known, recoverable failure mode — the catch site can
 * branch on `instanceof` instead of pattern-matching error messages.
 */

export class BotError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = this.constructor.name;
	}
}

/** Misconfiguration: missing field, invalid combination, etc. */
export class ConfigError extends BotError {}

/** The actor isn't allowed to perform the requested action. */
export class PermissionError extends BotError {}

/**
 * Wraps a `DiscordAPIError` so callers can branch on a stable code
 * without importing discord.js's class hierarchy.
 */
export class DiscordAPIErrorWrapper extends BotError {
	constructor(message: string, public readonly discordCode: number, options?: ErrorOptions) {
		super(message, options);
	}
}

const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_DEPTH = 5;

export interface SerializedError {
	name: string;
	message: string;
	stack?: string;
	code?: string;
	cause?: SerializedError;
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}…(${value.length - max} more chars)`;
}

/**
 * True iff `error` looks like a Prisma `PrismaClientKnownRequestError`
 * with the given code. Duck-typed so callers don't need to import the
 * Prisma namespace and pay the type-check cost on every catch site.
 *
 * Common codes:
 *   - `P2002` unique constraint violation
 *   - `P2025` operation depends on a record that doesn't exist
 */
export function isPrismaErrorWithCode(error: unknown, code: string): boolean {
	return typeof error === "object"
		&& error !== null
		&& "code" in error
		&& (error as { code: unknown }).code === code;
}

/**
 * Reduce an unknown thrown value to a structured shape that's safe to log
 * and ship to Sentry. Preserves the cause chain, exposes Prisma's `.code`
 * for catch-site branching, redacts known secrets, and truncates long
 * stacks so a single rogue error can't fill the log buffer.
 */
export function serializeError(error: unknown, depth = 0): SerializedError {
	if (depth > MAX_DEPTH) {
		return { name: "MaxDepthReached", message: "(error chain truncated)" };
	}

	if (error instanceof Error) {
		const result: SerializedError = {
			name: error.name,
			message: redactSecrets(truncate(error.message, MAX_MESSAGE))
		};

		if (error.stack) {
			result.stack = redactSecrets(truncate(error.stack, MAX_STACK));
		}

		// Prisma's `PrismaClientKnownRequestError` carries a string `.code`
		// (P2002, P2025, …). Surface it generically without importing
		// Prisma here.
		const candidate = error as { code?: unknown };
		if (typeof candidate.code === "string") {
			result.code = candidate.code;
		}

		if (error.cause !== undefined) {
			result.cause = serializeError(error.cause, depth + 1);
		}

		return result;
	}

	if (typeof error === "object" && error !== null) {
		try {
			return {
				name: "UnknownObject",
				message: redactSecrets(truncate(JSON.stringify(error), MAX_MESSAGE))
			};
		} catch {
			return { name: "UnknownObject", message: "(unserializable)" };
		}
	}

	return {
		name: typeof error,
		message: redactSecrets(truncate(String(error), MAX_MESSAGE))
	};
}
