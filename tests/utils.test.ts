import { humanizeTimestamp, pluralize } from "../src/utils";
import { describe, expect, test } from "bun:test";

describe("utils", () => {
    test("pluralize", () => {
        expect(pluralize(0, "car")).toBe("cars");
        expect(pluralize(1, "car")).toBe("car");
        expect(pluralize(2, "car")).toBe("cars");
        expect(pluralize(2, "index", "indices")).toBe("indices");
    });

    test("msToString", () => {
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
});