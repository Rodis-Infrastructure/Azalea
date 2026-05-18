import { describe, expect, test } from "bun:test";
import { stripUrlQueryString } from "@utils/secrets";

describe(stripUrlQueryString.name, () => {
	test("returns the URL unchanged when no query string", () => {
		expect(stripUrlQueryString("https://example.com/path")).toBe("https://example.com/path");
	});

	test("removes a non-empty query string", () => {
		expect(stripUrlQueryString("https://example.com/path?key=secret&id=42"))
			.toBe("https://example.com/path");
	});

	test("removes an empty query string", () => {
		expect(stripUrlQueryString("https://example.com/path?")).toBe("https://example.com/path");
	});

	test("handles a URL that's only a query string", () => {
		expect(stripUrlQueryString("?key=value")).toBe("");
	});
});
