/**
 * Centralised secret detection. Used by Sentry's `beforeSend` /
 * `beforeBreadcrumb` to scrub secrets from outbound events, and by
 * `serializeError` to do the same for any error rendered into a log line.
 *
 * The secret list is derived once on first access from `process.env`.
 * That makes the module tolerant of any import ordering — callers don't
 * need to wait for boot to finish before invoking `redactSecrets`.
 */
const SECRET_ENV_VAR_PATTERN = /(TOKEN|KEY|SECRET|PASSWORD|PWD|DSN|CREDENTIAL)/i;

let cached: readonly string[] | null = null;

function getSecrets(): readonly string[] {
	if (cached !== null) return cached;

	const found: string[] = [];
	for (const [name, value] of Object.entries(process.env)) {
		if (!value || value.length < 8) continue;
		if (SECRET_ENV_VAR_PATTERN.test(name)) found.push(value);
	}
	cached = found;
	return cached;
}

/** Replace every known secret value in `input` with `[REDACTED]`. */
export function redactSecrets(input: string): string {
	let result = input;
	for (const secret of getSecrets()) {
		result = result.replaceAll(secret, "[REDACTED]");
	}
	return result;
}

/**
 * Drop the query string from a URL. Used to keep secrets that appear as
 * query parameters (Rover, VirusTotal) out of Sentry breadcrumbs.
 */
export function stripUrlQueryString(url: string): string {
	const idx = url.indexOf("?");
	return idx === -1 ? url : url.slice(0, idx);
}
