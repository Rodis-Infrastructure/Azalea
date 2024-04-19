import { CLIENT_INTENTS, CLIENT_PARTIALS, EXIT_EVENTS } from "./utils/constants";
import { PrismaClient } from "@prisma/client";
import { handleProcessExit } from "./utils";
import { Client, Events } from "discord.js";

import Sentry from "@sentry/node";
import CommandManager from "./managers/commands/CommandManager";
import EventListenerManager from "./managers/events/EventListenerManager";
import ComponentManager from "./managers/components/ComponentManager";
import ConfigManager from "./managers/config/ConfigManager";
import Logger from "./utils/logger";

// Initialize Sentry
Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    profilesSampleRate: 1,
    tracesSampleRate: 1
});

// Handle process exit
EXIT_EVENTS.forEach(event => {
    process.once(event, async () => {
        await handleProcessExit(event);
    });
});

if (!process.env.DISCORD_TOKEN) {
    throw new Error("No token provided! Configure the DISCORD_TOKEN environment variable.");
}

// Database client
export const prisma = new PrismaClient();

/*
 * ### Discord Client
 *
 * Since `client.login()` is called first, we can safely assume that the client is logged in
 */
export const client: Client<true> = new Client({
    intents: CLIENT_INTENTS,
    partials: CLIENT_PARTIALS
});

async function main(): Promise<void> {
    // Cache all components
    await ComponentManager.cache();

    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);

    // Cache all commands
    await CommandManager.cache();

    // Cache the configurations
    ConfigManager.cacheGlobalConfig();
    await ConfigManager.cacheGuildConfigs();

    // Mount all event listeners
    await EventListenerManager.mount();

    // Publish all commands (must be logged in)
    await CommandManager.publish();

    // Emit the ready event as it was skipped
    client.emit(Events.ClientReady, client);
}

// Perform closing operations on error
main()
    .catch(error => {
        const sentryId = Sentry.captureException(error);
        Logger.error(`An unhandled error occurred: ${sentryId}`);

        process.exit(0);
    });

// TODO - Message reports
// TODO - User reports
// TODO - User/Message report alerts
// TODO - FAQ command
// TODO - Role requests