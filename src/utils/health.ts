import { name as APP_NAME, version as APP_VERSION } from "../../package.json";

import Logger from "./logger";

interface HealthState {
	ready: boolean;
}

interface HealthServerHandle {
	/** Flip ready=true once Discord has emitted ClientReady and crons are mounted. */
	markReady(): void;
	/** ISO 8601 timestamp captured when the server started. The editor uses this to detect a fresh process across pm2 reloads. */
	readonly startedAt: string;
}

const DEFAULT_HEALTH_PORT = 7475;
const DEFAULT_HEALTH_HOST = "127.0.0.1";

function resolvePort(override?: number): number {
	if (typeof override === "number") return override;
	const fromEnv = Number.parseInt(process.env.HEALTH_PORT ?? "", 10);
	return Number.isFinite(fromEnv) ? fromEnv : DEFAULT_HEALTH_PORT;
}

/**
 * Tiny localhost-only health endpoint consumed by the sibling `azalea-editor`
 * service to verify a `pm2 reload` actually produced a healthy bot process.
 *
 * Returns 200 with `{ ready, pid, startedAt, name, version }`. `ready` flips
 * to true once {@link HealthServerHandle.markReady} is called (from the Ready
 * event, after crons are mounted). `startedAt` strictly advances across
 * process restarts, which is the editor's signal that a reload succeeded —
 * `pm2`'s own `restart_time` and `online` status both lie about reload
 * outcome.
 *
 * Bound to 127.0.0.1 by default; never expose this directly to the internet.
 */
export function startHealthServer(options: {
	port?: number;
	host?: string;
} = {}): HealthServerHandle {
	const port = resolvePort(options.port);
	const host = options.host ?? process.env.HEALTH_HOST ?? DEFAULT_HEALTH_HOST;
	const startedAt = new Date().toISOString();
	const state: HealthState = { ready: false };

	Bun.serve({
		port,
		hostname: host,
		fetch(request): Response {
			const url = new URL(request.url);
			if (url.pathname !== "/healthz") {
				return new Response("Not Found", { status: 404 });
			}

			const body = JSON.stringify({
				ready: state.ready,
				pid: process.pid,
				startedAt,
				name: APP_NAME,
				version: APP_VERSION
			});

			const headers = new Headers();
			headers.set("content-type", "application/json");
			return new Response(body, { headers });
		}
	});

	Logger.info(`Health endpoint listening on http://${host}:${port}/healthz`);

	return {
		markReady(): void {
			state.ready = true;
		},
		startedAt
	};
}
