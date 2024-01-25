import { msToString, pluralize } from "../src/utils";
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
        expect(msToString(0)).toBe("< 1 minute");

        // Singular durations
        expect(msToString(MINUTE)).toBe("1 minute");
        expect(msToString(HOUR)).toBe("1 hour");
        expect(msToString(DAY)).toBe("1 day");

        // Plural durations
        expect(msToString(MINUTE * 2)).toBe("2 minutes");
        expect(msToString(HOUR * 2)).toBe("2 hours");
        expect(msToString(DAY * 2)).toBe("2 days");

        // Mixed durations
        // Tests prioritization of larger units
        expect(msToString(MINUTE + HOUR + DAY)).toBe("1 day 1 hour 1 minute");
        expect(msToString((MINUTE + HOUR + DAY) * 2)).toBe("2 days 2 hours 2 minutes");
    });
});