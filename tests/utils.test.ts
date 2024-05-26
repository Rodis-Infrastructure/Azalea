import {
    channelMentionWithName,
    cropLines,
    elipsify,
    formatInfractionReason,
    formatInfractionReasonPreview,
    getObjectDiff,
    humanizeTimestamp,
    pluralize,
    userMentionWithId
} from "@/utils";

import { describe, expect, test } from "bun:test";
import { GuildBasedChannel } from "discord.js";
import { ObjectDiff } from "@utils/types";

describe("utils", () => {
    test(pluralize.name, () => {
        expect(pluralize(0, "car")).toBe("cars");
        expect(pluralize(1, "car")).toBe("car");
        expect(pluralize(2, "car")).toBe("cars");
        expect(pluralize(2, "index", "indices")).toBe("indices");
    });

    test(humanizeTimestamp.name, () => {
        const MINUTE = 1000 * 60;
        const HOUR = MINUTE * 60;
        const DAY = HOUR * 24;

        // Zero duration
        expect(humanizeTimestamp(0)).toBe("< 1 minute");

        // Singular durations
        expect(humanizeTimestamp(MINUTE)).toBe("1 minute");
        expect(humanizeTimestamp(HOUR)).toBe("1 hour");
        expect(humanizeTimestamp(DAY)).toBe("1 day");

        // Plural durations
        expect(humanizeTimestamp(MINUTE * 2)).toBe("2 minutes");
        expect(humanizeTimestamp(HOUR * 2)).toBe("2 hours");
        expect(humanizeTimestamp(DAY * 2)).toBe("2 days");

        // Mixed durations
        // Tests prioritization of larger units
        expect(humanizeTimestamp(MINUTE + HOUR + DAY)).toBe("1 day 1 hour 1 minute");
        expect(humanizeTimestamp((MINUTE + HOUR + DAY) * 2)).toBe("2 days 2 hours 2 minutes");
    });

    test(cropLines.name, () => {
        const MAX_LINES = 3;
        const text = (lines: number): string => `A${"\n".repeat(lines)}B`;

        // Test data
        const unchanged = text(MAX_LINES - 1);
        const boundary = text(MAX_LINES);
        const long = text(MAX_LINES + 1);

        // Expected test results
        const expectedBoundaryResult = "A\n\n(1 more line)";
        const expectedLongResult = "A\n\n(2 more lines)";

        // Tests
        expect(cropLines(unchanged, MAX_LINES)).toBe(unchanged);
        expect(cropLines(boundary, MAX_LINES)).toBe(expectedBoundaryResult);
        expect(cropLines(long, MAX_LINES)).toBe(expectedLongResult);
    });

    test(getObjectDiff.name, () => {
        // Test data
        const oldState = { a: 1, b: 2, c: 3 };
        const newState = { a: 1, b: 3, c: 4 };
        const runWithInvalidArguments = (): ObjectDiff => getObjectDiff(null, null);

        // Expected test results
        const expectedError = new Error("Both parameters must be non-null objects");

        // Tests
        expect(getObjectDiff(oldState, oldState)).toEqual({});
        expect(runWithInvalidArguments).toThrow(expectedError);
        expect(getObjectDiff(oldState, newState)).toEqual({
            b: { old: 2, new: 3 },
            c: { old: 3, new: 4 }
        });
    });

    test(userMentionWithId.name, () => {
        const USER_ID = "1";
        expect(userMentionWithId(USER_ID)).toBe(`<@${USER_ID}> (\`${USER_ID}\`)`);
    });

    test(channelMentionWithName.name, () => {
        const CHANNEL = { id: "1", name: "channel" } as GuildBasedChannel;
        expect(channelMentionWithName(CHANNEL)).toBe(`<#${CHANNEL.id}> (\`#${CHANNEL.name}\`)`);
    });

    test(elipsify.name, () => {
        const MAX_LENGTH = 50;
        const text = (length: number): string => "A".repeat(length);

        // Test data
        const unchanged = text(MAX_LENGTH - 1);
        const boundaryUnchanged = text(MAX_LENGTH);
        const long = text(MAX_LENGTH + 1);

        // Expected test results
        const longCropped = text(MAX_LENGTH - 23);
        const expectedLongResult = `${longCropped}…(24 more characters)`;

        // Tests
        expect(elipsify(unchanged, MAX_LENGTH)).toBe(unchanged);
        expect(elipsify(boundaryUnchanged, MAX_LENGTH)).toBe(boundaryUnchanged);
        expect(elipsify(long, MAX_LENGTH)).toBe(expectedLongResult);
    });

    test(formatInfractionReason.name, () => {
        // Test data
        const cleanReason = "This is a test reason";
        const formattedReason = "This `is` a test ```reason```";

        // Expected test results
        const expected = `(\`${cleanReason}\`)`;

        // Tests
        expect(formatInfractionReason(formattedReason)).toBe(expected);
        expect(formatInfractionReason(cleanReason)).toBe(expected);
    });

    test(formatInfractionReasonPreview.name, () => {
        const LINK = "https://example.com";
        const PURGE_LOG = `(Purge log: ${LINK})`;

        // Test data
        const cleanReason = "This is a test reason";
        const reason = `${cleanReason} ${LINK} ${PURGE_LOG}`;

        // Tests
        expect(formatInfractionReasonPreview(reason)).toBe(cleanReason);
    });
});