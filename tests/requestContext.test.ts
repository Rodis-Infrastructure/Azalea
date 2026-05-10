import { describe, expect, test } from "bun:test";
import { getRequestContext, runWithRequestContext } from "@utils/requestContext";

describe(runWithRequestContext.name, () => {
	test("makes context visible to nested sync calls", () => {
		const observed = runWithRequestContext({ guild_id: "G", user_id: "U" }, () => {
			return getRequestContext();
		});
		expect(observed).toEqual({ guild_id: "G", user_id: "U" });
	});

	test("returns undefined outside any context", () => {
		expect(getRequestContext()).toBeUndefined();
	});

	test("merges nested contexts — child wins on key collision", () => {
		const observed = runWithRequestContext({ guild_id: "G", source: "outer" }, () => {
			return runWithRequestContext({ source: "inner", command: "ban" }, () => {
				return getRequestContext();
			});
		});
		expect(observed).toEqual({ guild_id: "G", source: "inner", command: "ban" });
	});

	test("propagates across async boundaries", async () => {
		const observed = await runWithRequestContext({ guild_id: "G" }, async () => {
			await new Promise(resolve => setTimeout(resolve, 5));
			return getRequestContext();
		});
		expect(observed).toEqual({ guild_id: "G" });
	});

	test("does not leak context to siblings outside the run", () => {
		const inside = runWithRequestContext({ guild_id: "G" }, () => getRequestContext());
		const outside = getRequestContext();
		expect(inside).toEqual({ guild_id: "G" });
		expect(outside).toBeUndefined();
	});
});
