import { describe, expect, test } from "bun:test";
import { elipsify, pluralize } from "../src/utils";

describe("utils", () => {
    test("pluralize", () => {
        expect(pluralize(0, "car")).toBe("cars");
        expect(pluralize(1, "car")).toBe("car");
        expect(pluralize(2, "car")).toBe("cars");
        expect(pluralize(2, "index", "indices")).toBe("indices");
    });

    test("elipsify", () => {
        const MAX_LENGTH = 1000;
        const TEST_CHAR = "*";

        const strShort = TEST_CHAR.repeat(MAX_LENGTH - 100);
        const strBoundary = TEST_CHAR.repeat(MAX_LENGTH);

        const strLong = TEST_CHAR.repeat(MAX_LENGTH + 100);
        const strCropped = TEST_CHAR.repeat(MAX_LENGTH - 25) + "...(125 more characters)";

        expect(elipsify(strShort, MAX_LENGTH)).toBe(strShort);
        expect(elipsify(strBoundary, MAX_LENGTH)).toBe(strBoundary);
        expect(elipsify(strLong, MAX_LENGTH)).toBe(strCropped);
    });
});