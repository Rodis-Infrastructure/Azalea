import { afterAll, describe, expect, test } from "bun:test";
import { startHealthServer } from "@/utils/health";

const TEST_PORT = 17476;

describe("startHealthServer", () => {
	const handle = startHealthServer({ port: TEST_PORT, host: "127.0.0.1" });
	const url = `http://127.0.0.1:${TEST_PORT}/healthz`;

	afterAll(() => {
		// Bun.serve has no formal stop returned from startHealthServer; rely on
		// test process exit to release the port. Each test file runs in its own
		// Bun instance, so leakage doesn't affect other tests.
	});

	interface HealthBody {
		ready: boolean;
		pid: number;
		startedAt: string;
		name: string;
		version: string;
	}

	test("returns ready=false before markReady() is called", async () => {
		const res = await fetch(url);
		expect(res.status).toBe(200);
		const body = await res.json() as HealthBody;
		expect(body).toMatchObject({
			ready: false,
			pid: process.pid,
			name: "azalea"
		});
		expect(typeof body.startedAt).toBe("string");
		expect(typeof body.version).toBe("string");
	});

	test("flips ready=true after markReady() and keeps the original startedAt", async () => {
		const before = await fetch(url).then(r => r.json() as Promise<HealthBody>);
		handle.markReady();
		const after = await fetch(url).then(r => r.json() as Promise<HealthBody>);

		expect(after.ready).toBe(true);
		expect(after.startedAt).toBe(before.startedAt);
	});

	test("returns 404 for any other path", async () => {
		const res = await fetch(`http://127.0.0.1:${TEST_PORT}/somethingelse`);
		expect(res.status).toBe(404);
	});
});
