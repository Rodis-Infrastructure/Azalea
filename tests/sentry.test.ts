import { buildGuildScope, buildInteractionScope } from "@utils/sentry";
import { describe, expect, test } from "bun:test";
import type { Interaction } from "discord.js";

// Build a typed minimal stub for Interaction. Only the fields the helpers
// touch are populated; everything else is omitted via the `as` cast.
function fakeInteraction(overrides: Partial<{
	guildId: string | null;
	channelId: string | null;
	user: { id: string; username: string };
	kind: "slash" | "context_menu" | "modal" | "button" | "select_menu" | "autocomplete";
	commandName: string;
	customId: string;
}>): Interaction {
	const kind = overrides.kind ?? "slash";
	return {
		guildId: overrides.guildId ?? null,
		channelId: overrides.channelId ?? null,
		user: overrides.user ?? { id: "111", username: "alice" },
		commandName: overrides.commandName,
		customId: overrides.customId,
		isChatInputCommand: () => kind === "slash",
		isContextMenuCommand: () => kind === "context_menu",
		isModalSubmit: () => kind === "modal",
		isButton: () => kind === "button",
		isAnySelectMenu: () => kind === "select_menu"
	} as unknown as Interaction;
}

describe(buildInteractionScope.name, () => {
	test("tags a slash command with command name and kind", () => {
		const scope = buildInteractionScope(fakeInteraction({
			guildId: "G",
			channelId: "C",
			commandName: "ban",
			kind: "slash"
		}));

		expect(scope.tags).toEqual({
			guild_id: "G",
			channel_id: "C",
			command: "ban",
			command_kind: "slash"
		});
		expect(scope.user).toEqual({ id: "111", username: "alice" });
	});

	test("tags a context menu command with kind=context_menu", () => {
		const scope = buildInteractionScope(fakeInteraction({
			guildId: "G",
			commandName: "Quick mute (30m)",
			kind: "context_menu"
		}));

		expect(scope.tags).toMatchObject({
			command: "Quick mute (30m)",
			command_kind: "context_menu"
		});
	});

	test("tags a modal submission with custom_id and kind=modal", () => {
		const scope = buildInteractionScope(fakeInteraction({
			guildId: "G",
			customId: "report-modal",
			kind: "modal"
		}));

		expect(scope.tags).toMatchObject({
			custom_id: "report-modal",
			command_kind: "modal"
		});
	});

	test("tags a button click with custom_id and kind=component", () => {
		const scope = buildInteractionScope(fakeInteraction({
			guildId: "G",
			customId: "approve-ban-42",
			kind: "button"
		}));

		expect(scope.tags).toMatchObject({
			custom_id: "approve-ban-42",
			command_kind: "component"
		});
	});

	test("falls back to guild_id=dm when not in a guild", () => {
		const scope = buildInteractionScope(fakeInteraction({ guildId: null }));
		expect(scope.tags).toMatchObject({ guild_id: "dm" });
	});

	test("omits channel_id when channel is unknown", () => {
		const scope = buildInteractionScope(fakeInteraction({ channelId: null }));
		expect(scope.tags).not.toHaveProperty("channel_id");
	});

	test("forwards extra context as-is", () => {
		const scope = buildInteractionScope(fakeInteraction({}), { target_id: "999" });
		expect(scope.extra).toEqual({ target_id: "999" });
	});
});

describe(buildGuildScope.name, () => {
	test("tags guild_id and merges custom tags", () => {
		const scope = buildGuildScope("G", {
			tags: { source: "guild_ban_cleanup" }
		});

		expect(scope.tags).toEqual({
			guild_id: "G",
			source: "guild_ban_cleanup"
		});
	});

	test("attaches user when userId is provided", () => {
		const scope = buildGuildScope("G", { userId: "U", username: "bob" });
		expect(scope.user).toEqual({ id: "U", username: "bob" });
	});

	test("omits user when userId is missing", () => {
		const scope = buildGuildScope("G");
		expect(scope.user).toBeUndefined();
	});

	test("custom tag does not overwrite guild_id", () => {
		const scope = buildGuildScope("G", { tags: { guild_id: "should-be-ignored" } });
		// guild_id is added after the spread, so the helper's value wins
		expect(scope.tags?.guild_id).toBe("G");
	});

	test("forwards extra context as-is", () => {
		const scope = buildGuildScope("G", { extra: { target_id: "9" } });
		expect(scope.extra).toEqual({ target_id: "9" });
	});
});
