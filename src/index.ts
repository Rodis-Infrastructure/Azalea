// eslint-disable-next-line @dword-design/import-alias/prefer-alias
import { CLIENT_INTENTS, CLIENT_PARTIALS, EXIT_EVENTS } from "@utils/constants";
import { PrismaClient } from "@prisma/client";
import { startCleanupOperations } from "./utils";
import { Client, Events, Options } from "discord.js";
import { captureException, init as initSentry } from "@sentry/node";

import CommandManager from "./managers/commands/CommandManager";
import EventListenerManager from "./managers/events/EventListenerManager";
import ComponentManager from "./managers/components/ComponentManager";
import ConfigManager from "./managers/config/ConfigManager";
import Logger from "./utils/logger";

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

async function main(): Promise<void> {
	if (!process.env.DISCORD_TOKEN) {
		throw new Error("No token provided! Configure the DISCORD_TOKEN environment variable.");
	}

	if (!process.env.SENTRY_DSN) {
		throw new Error("No sentry DSN provided! Configure the SENTRY_DSN environment variable.");
	}

	// Initialize Sentry
	initSentry({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.NODE_ENV,
		profilesSampleRate: 1,
		tracesSampleRate: 1
	});

	// Cache all components
	await ComponentManager.cache();

	// Login to Discord
	await client.login(process.env.DISCORD_TOKEN);

	// Cache the configurations
	ConfigManager.cacheGlobalConfig();
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
	// Perform closing operations on error
	main()
		.catch(error => {
			const sentryId = captureException(error);

			Logger.error(`An unhandled error occurred: ${sentryId}`);
			Logger.error(error);

			process.exit(0);
		});
}