import { captureException as sentryCapture } from "@sentry/node";
import type { Interaction } from "discord.js";

export { captureException } from "@sentry/node";

/**
 * Capture an error with rich Discord interaction context. Tags are searchable
 * in the Sentry UI; `extra` is shown on the issue page but not searchable.
 *
 * Tags applied: `guild_id`, `channel_id`, `command`/`custom_id`, `command_kind`.
 * User context: `id` and `username` from the interaction.
 */
export function captureInteractionError(
	error: unknown,
	interaction: Interaction,
	extra?: Record<string, unknown>
): string {
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

	return sentryCapture(error, {
		user: { id: interaction.user.id, username: interaction.user.username },
		tags,
		extra
	});
}

/**
 * Capture an error with guild and optional user context. Useful for event
 * handlers that don't originate from an interaction (member events, bans, etc).
 */
export function captureGuildError(
	error: unknown,
	guildId: string,
	options?: {
		userId?: string;
		username?: string;
		tags?: Record<string, string>;
		extra?: Record<string, unknown>;
	}
): string {
	return sentryCapture(error, {
		user: options?.userId
			? { id: options.userId, username: options.username }
			: undefined,
		tags: { guild_id: guildId, ...options?.tags },
		extra: options?.extra
	});
}
