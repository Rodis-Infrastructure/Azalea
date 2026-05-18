import { AsyncLocalStorage } from "node:async_hooks";
import { withIsolationScope } from "@sentry/node";

/**
 * Per-request scratchpad for observability tags. Whatever ends up in here
 * is automatically:
 *
 * 1. merged into every log line emitted inside the request (see Logger),
 * 2. attached as Sentry tags so any `captureException` call inside the
 *    request inherits them without having to pass the interaction explicitly.
 *
 * Field names are the same snake_case identifiers the Sentry helpers
 * already use (`guild_id`, `command`, `custom_id`, `event_name`, …) so a
 * tag set here is queryable in Sentry the same way a tag set via
 * `buildInteractionScope` is.
 */
export interface RequestContext {
	[key: string]: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with a request context active.
 *
 * Nested invocations merge — child fields override parent fields when the
 * key collides. The Sentry scope inside `fn` inherits the merged tags so
 * any `captureException` call further down the stack gets them
 * automatically; that's the entire point of routing every event through
 * here rather than threading the context as an argument.
 */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	const merged: RequestContext = { ...storage.getStore(), ...ctx };

	return storage.run(merged, () => {
		return withIsolationScope(scope => {
			for (const [key, value] of Object.entries(merged)) {
				if (typeof value === "string") scope.setTag(key, value);
			}
			return fn();
		}) as T;
	});
}

/**
 * Read the active request context, if any. Used by Logger to enrich
 * structured output and by capture helpers to provide tag fallbacks.
 */
export function getRequestContext(): RequestContext | undefined {
	return storage.getStore();
}
