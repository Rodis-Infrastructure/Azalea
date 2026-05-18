// eslint-disable-next-line @dword-design/import-alias/prefer-alias
import { CLIENT_INTENTS, CLIENT_PARTIALS, EXIT_EVENTS } from "@utils/constants";
import { PrismaClient } from "@prisma/client";
import { startCleanupOperations } from "./utils";
import { Client, Events, Options } from "discord.js";
import { flush as flushSentry, init as initSentry, prismaIntegration } from "@sentry/node";

import { version as APP_VERSION, name as APP_NAME } from "../package.json";
import { captureException } from "./utils/sentry";
import { redactSecrets, stripUrlQueryString } from "./utils/secrets";
import { serializeError } from "./utils/errors";
import CommandManager from "./managers/commands/CommandManager";
import EventListenerManager from "./managers/events/EventListenerManager";
import ComponentManager from "./managers/components/ComponentManager";
import ConfigManager from "./managers/config/ConfigManager";
import Logger from "./utils/logger";
import { startHealthServer } from "./utils/health";

// Health endpoint started at module load so the editor can detect the new
// process the moment pm2 reload spawns it; ready flips once Ready.ts fires.
export const health = startHealthServer();

// Handle process exit
EXIT_EVENTS.forEach(event => {
	process.once(event, async () => {
		await startCleanupOperations(event);
	});
});

// Database client
export const prisma = new PrismaClient();

/*
 * ### Discord Client
 *
 * Since `client.login()` is called first, we can safely assume that the client is logged in
 */
export const client: Client<true> = new Client({
	intents: CLIENT_INTENTS,
	partials: CLIENT_PARTIALS,
	makeCache: Options.cacheWithLimits({
		/* eslint-disable @typescript-eslint/naming-convention, capitalized-comments */
		GuildMessageManager: 100, // channel.messages
		BaseGuildEmojiManager: 0, // guild.emojis
		StageInstanceManager: 0, // guild.stageInstances
		ThreadManager: 0, // channel.threads
		AutoModerationRuleManager: 0,
		DMMessageManager: 0,
		GuildForumThreadManager: 0,
		GuildInviteManager: 0, // guild.invites
		PresenceManager: 0, // guild.presences
		GuildScheduledEventManager: 0, // guild.scheduledEvents
		ThreadMemberManager: 0 // thread.members
		/* eslint-enable @typescript-eslint/naming-convention, capitalized-comments */
	})
});

// Surface discord.js client lifecycle events. Without these, transport-level
// failures and shard errors fall through to `unhandledRejection` with no tag.
client.on(Events.Error, error => {
	Logger.error(`Discord client error: ${error.message}`);
	captureException(error, { tags: { source: "discord_client_error" } });
});
client.on(Events.ShardError, (error, shardId) => {
	Logger.error(`Discord shard ${shardId} error: ${error.message}`);
	captureException(error, {
		tags: { source: "discord_shard_error", shard_id: String(shardId) }
	});
});
client.on(Events.Warn, message => {
	Logger.warn(`Discord client warning: ${message}`);
});

async function main(): Promise<void> {
	if (!process.env.DISCORD_TOKEN) {
		throw new Error("No token provided! Configure the DISCORD_TOKEN environment variable.");
	}

	const resolvedEnv = process.env.NODE_ENV ?? "development";

	if (process.env.SENTRY_DSN) {
		const isProd = resolvedEnv === "production";

		initSentry({
			dsn: process.env.SENTRY_DSN,
			release: `${APP_NAME}@${APP_VERSION}`,
			environment: resolvedEnv,
			profilesSampleRate: isProd ? 0.1 : 1,
			tracesSampleRate: isProd ? 0.2 : 1,
			attachStacktrace: true,
			integrations: [
				// Spans every Prisma query so slow / failing DB calls show
				// up in the performance view.
				prismaIntegration()
			],
			ignoreErrors: [
				"DiscordAPIError[10008]",
				"DiscordAPIError[50013]",
				"AbortError"
			],
			beforeSend(event) {
				if (event.exception?.values) {
					for (const exception of event.exception.values) {
						if (exception.value) {
							exception.value = redactSecrets(exception.value);
						}
					}
				}
				return event;
			},
			beforeBreadcrumb(breadcrumb) {
				const data = breadcrumb.data;
				if (data && typeof data.url === "string") {
					data.url = redactSecrets(stripUrlQueryString(data.url));
				}
				if (typeof breadcrumb.message === "string") {
					breadcrumb.message = redactSecrets(breadcrumb.message);
				}
				return breadcrumb;
			}
		});
	} else {
		Logger.warn("SENTRY_DSN is not set; error reporting is disabled.");
	}

	Logger.info(`Boot: env=${resolvedEnv}, sentry=${process.env.SENTRY_DSN ? "enabled" : "disabled"}, version=${APP_VERSION}`);

	// Cache all components
	await ComponentManager.cache();

	// Login to Discord
	await client.login(process.env.DISCORD_TOKEN);

	// Cache the configurations
	await ConfigManager.cacheGlobalConfig();
	await ConfigManager.cacheGuildConfigs();

	// Cache all commands
	await CommandManager.cache();

	// Mount all event listeners
	await EventListenerManager.mount();

	// Publish all commands (must be logged in)
	await CommandManager.publish();

	// Emit the ready event as it was skipped
	client.emit(Events.ClientReady, client);
}

if (process.env.NODE_ENV !== "test") {
	// Last-resort safety net for async errors that escape the call stack.
	process.on("unhandledRejection", reason => {
		const sentryId = captureException(reason);
		Logger.error(`Unhandled promise rejection (${sentryId})`, { error: serializeError(reason) });
	});

	process.on("uncaughtException", error => {
		const sentryId = captureException(error);
		Logger.error(`Uncaught exception (${sentryId})`, { error: serializeError(error) });
	});

	// Perform closing operations on error
	main()
		.catch(async error => {
			const sentryId = captureException(error);
			Logger.error(`An unhandled error occurred (${sentryId})`, { error: serializeError(error) });
			await flushSentry(2000).catch(() => null);
			process.exit(1);
		});
}