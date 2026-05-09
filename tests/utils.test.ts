import {
	channelMentionWithName,
	cropLines,
	ellipsize,
	enhancedRoleMention,
	formatEmojiUrl,
	getFileViewerURL,
	getObjectDiff,
	humanizeDuration,
	pluralize,
	roleMentionWithName,
	stringifyJSON,
	toOrdinal,
	userMentionWithId
} from "@/utils";

import { describe, expect, test } from "bun:test";
import { GuildBasedChannel, Role } from "discord.js";
import { ObjectDiff } from "@utils/types";

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

describe(pluralize.name, () => {
	test("pluralizes by default suffix", () => {
		expect(pluralize(0, "car")).toBe("cars");
		expect(pluralize(1, "car")).toBe("car");
		expect(pluralize(2, "car")).toBe("cars");
	});

	test("uses the explicit plural form when provided", () => {
		expect(pluralize(2, "index", "indices")).toBe("indices");
		expect(pluralize(1, "index", "indices")).toBe("index");
	});
});

describe(humanizeDuration.name, () => {
	test("returns the < 1 minute fallback for sub-minute durations", () => {
		expect(humanizeDuration(0)).toBe("< 1 minute");
		expect(humanizeDuration(SECOND * 30)).toBe("< 1 minute");
	});

	test("formats singular units", () => {
		expect(humanizeDuration(MINUTE)).toBe("1 minute");
		expect(humanizeDuration(HOUR)).toBe("1 hour");
		expect(humanizeDuration(DAY)).toBe("1 day");
	});

	test("formats plural units", () => {
		expect(humanizeDuration(MINUTE * 2)).toBe("2 minutes");
		expect(humanizeDuration(HOUR * 2)).toBe("2 hours");
		expect(humanizeDuration(DAY * 2)).toBe("2 days");
	});

	test("renders larger units before smaller ones", () => {
		expect(humanizeDuration(MINUTE + HOUR + DAY)).toBe("1 day 1 hour 1 minute");
		expect(humanizeDuration((MINUTE + HOUR + DAY) * 2)).toBe("2 days 2 hours 2 minutes");
	});
});

describe(cropLines.name, () => {
	const MAX_LINES = 3;
	const text = (lines: number): string => `A${"\n".repeat(lines)}B`;

	test("returns the input unchanged below the threshold", () => {
		expect(cropLines(text(MAX_LINES - 1), MAX_LINES)).toBe(text(MAX_LINES - 1));
	});

	test("crops at the boundary, summarizing the dropped lines", () => {
		expect(cropLines(text(MAX_LINES), MAX_LINES)).toBe("A\n\n(1 more line)");
	});

	test("pluralizes the suffix when more than one line is dropped", () => {
		expect(cropLines(text(MAX_LINES + 1), MAX_LINES)).toBe("A\n\n(2 more lines)");
	});
});

describe(getObjectDiff.name, () => {
	test("returns an empty diff for identical objects", () => {
		const state = { a: 1, b: 2, c: 3 };
		expect(getObjectDiff(state, state)).toEqual({});
	});

	test("emits old/new for each changed key", () => {
		const oldState = { a: 1, b: 2, c: 3 };
		const newState = { a: 1, b: 3, c: 4 };

		expect(getObjectDiff(oldState, newState)).toEqual({
			b: { old: 2, new: 3 },
			c: { old: 3, new: 4 }
		});
	});

	test("throws when either argument is null", () => {
		const expected = new Error("Both parameters must be non-null objects");
		expect((): ObjectDiff => getObjectDiff(null, null)).toThrow(expected);
		expect((): ObjectDiff => getObjectDiff({ a: 1 }, null)).toThrow(expected);
		expect((): ObjectDiff => getObjectDiff(null, { a: 1 })).toThrow(expected);
	});
});

describe("mention helpers", () => {
	test(userMentionWithId.name, () => {
		expect(userMentionWithId("1")).toBe("<@1> (`1`)");
	});

	test(channelMentionWithName.name, () => {
		const channel = { id: "1", name: "general" } as GuildBasedChannel;
		expect(channelMentionWithName(channel)).toBe("<#1> (`#general`)");
	});

	test(roleMentionWithName.name, () => {
		const role = { id: "1", name: "Mods" } as Role;
		expect(roleMentionWithName(role)).toBe("<@&1> (`@Mods`)");
	});
});

describe(enhancedRoleMention.name, () => {
	test("renders @everyone and @here as their mention strings", () => {
		expect(enhancedRoleMention("@everyone")).toBe("@everyone");
		expect(enhancedRoleMention("everyone")).toBe("@everyone");
		expect(enhancedRoleMention("@here")).toBe("@here");
		expect(enhancedRoleMention("here")).toBe("@here");
	});

	test("falls through to a role mention for normal IDs", () => {
		expect(enhancedRoleMention("123456789012345678")).toContain("123456789012345678");
	});
});

describe(ellipsize.name, () => {
	const MAX_LENGTH = 50;
	const text = (length: number): string => "A".repeat(length);

	test("returns the input unchanged at or below the threshold", () => {
		expect(ellipsize(text(MAX_LENGTH - 1), MAX_LENGTH)).toBe(text(MAX_LENGTH - 1));
		expect(ellipsize(text(MAX_LENGTH), MAX_LENGTH)).toBe(text(MAX_LENGTH));
	});

	test("crops with a counter suffix when over the threshold", () => {
		const cropped = text(MAX_LENGTH - 23);
		expect(ellipsize(text(MAX_LENGTH + 1), MAX_LENGTH)).toBe(`${cropped}…(24 more characters)`);
	});
});

describe(toOrdinal.name, () => {
	test("uses st/nd/rd/th for the standard cases", () => {
		expect(toOrdinal(1)).toBe("1st");
		expect(toOrdinal(2)).toBe("2nd");
		expect(toOrdinal(3)).toBe("3rd");
		expect(toOrdinal(4)).toBe("4th");
		expect(toOrdinal(21)).toBe("21st");
		expect(toOrdinal(22)).toBe("22nd");
		expect(toOrdinal(23)).toBe("23rd");
	});

	test("handles the 11/12/13 exceptions", () => {
		expect(toOrdinal(11)).toBe("11th");
		expect(toOrdinal(12)).toBe("12th");
		expect(toOrdinal(13)).toBe("13th");
		expect(toOrdinal(111)).toBe("111th");
		expect(toOrdinal(112)).toBe("112th");
	});

	test("accepts numeric strings", () => {
		expect(toOrdinal("1")).toBe("1st");
		expect(toOrdinal("11")).toBe("11th");
	});

	test("inserts thousands separators in the numeric portion", () => {
		expect(toOrdinal(1000)).toBe("1,000th");
		expect(toOrdinal(1001)).toBe("1,001st");
	});
});

describe(getFileViewerURL.name, () => {
	test("URL-encodes the input", () => {
		expect(getFileViewerURL("https://cdn.example/a b.png"))
			.toBe("https://discord-fv.vercel.app/?url=https%3A%2F%2Fcdn.example%2Fa%20b.png");
	});
});

describe(formatEmojiUrl.name, () => {
	test("builds a 320px webp URL for the given emoji ID", () => {
		expect(formatEmojiUrl("123"))
			.toBe("https://cdn.discordapp.com/emojis/123.webp?size=320");
	});
});

describe(stringifyJSON.name, () => {
	test("serializes BigInt values as decimal strings", () => {
		expect(stringifyJSON({ id: 9007199254740993n })).toContain('"id": "9007199254740993"');
	});

	test("respects the indent argument", () => {
		expect(stringifyJSON({ a: 1 }, 0)).toBe('{"a":1}');
		expect(stringifyJSON({ a: 1 })).toContain("\n  \"a\": 1");
	});
});
