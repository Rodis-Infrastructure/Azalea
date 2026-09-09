import { captureException as sentryCapture, flush as flushSentry } from "@sentry/node";
import type { Interaction } from "discord.js";

export { captureException } from "@sentry/node";

/**
 * Capture an error and wait for Sentry to drain. Used for unrecoverable
 * startup paths (missing config dir, schema parse failure, etc) — call
 * this then `process.exit(1)` so the captured event reaches the upstream
 * before the transport terminates.
 */
export async function captureAndFlush(error: unknown, scope?: SentryScope): Promise<void> {
	sentryCapture(error, scope);
	await flushSentry(2000).catch(() => null);
}

/**
 * Subset of Sentry's ScopeContext we actually use. Defining this locally avoids
 * reaching into @sentry/core (a transitive dependency that v10 does not
 * re-export from @sentry/node).
 */
export interface SentryScope {
	user?: { id?: string; username?: string };
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
}

/**
 * Build a Sentry scope from a Discord interaction. Tags are searchable in the
 * Sentry UI; `extra` is shown on the issue page but not searchable.
 *
 * Pure — exposed separately from {@link captureInteractionError} so the
 * tag-building behaviour can be tested without mocking the Sentry SDK.
 */
export function buildInteractionScope(
	interaction: Interaction,
	extra?: Record<string, unknown>
): SentryScope {
	const tags: Record<string, string> = {
		guild_id: interaction.guildId ?? "dm"
	};

	if (interaction.channelId) {
		tags.channel_id = interaction.channelId;
	}

	if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
		tags.command = interaction.commandName;
		tags.command_kind = interaction.isChatInputCommand() ? "slash" : "context_menu";
	} else if (interaction.isModalSubmit()) {
		tags.custom_id = interaction.customId;
		tags.command_kind = "modal";
	} else if (interaction.isButton() || interaction.isAnySelectMenu()) {
		tags.custom_id = interaction.customId;
		tags.command_kind = "component";
	}

	return {
		user: { id: interaction.user.id, username: interaction.user.username },
		tags,
		extra
	};
}

/**
 * Capture an error with rich Discord interaction context.
 * See {@link buildInteractionScope} for the tag list.
 */
export function captureInteractionError(
	error: unknown,
	interaction: Interaction,
	extra?: Record<string, unknown>
): string {
	return sentryCapture(error, buildInteractionScope(interaction, extra));
}

interface GuildScopeOptions {
	userId?: string;
	username?: string;
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
}

/**
 * Build a Sentry scope from a guild ID with optional user/tag/extra context.
 * Pure — see {@link buildInteractionScope} for rationale.
 */
export function buildGuildScope(
	guildId: string,
	options?: GuildScopeOptions
): SentryScope {
	return {
		user: options?.userId
			? { id: options.userId, username: options.username }
			: undefined,
		// Guild_id wins so caller-supplied tags can't accidentally clobber it
		tags: { ...options?.tags, guild_id: guildId },
		extra: options?.extra
	};
}

/**
 * Capture an error with guild and optional user context. Useful for event
 * handlers that don't originate from an interaction (member events, bans, etc).
 */
export function captureGuildError(
	error: unknown,
	guildId: string,
	options?: GuildScopeOptions
): string {
	return sentryCapture(error, buildGuildScope(guildId, options));
}
