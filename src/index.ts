import { CLIENT_INTENTS, CLIENT_PARTIALS, EXIT_EVENTS } from "@utils/constants";
import { PrismaClient } from "@prisma/client";
import { handleProcessExit } from "./utils";
import { Client } from "discord.js";

import Sentry from "@sentry/node";
import CommandManager from "./managers/commands/CommandManager";
import EventListenerManager from "./managers/events/EventListenerManager";
import ComponentManager from "./managers/components/ComponentManager";
import ConfigManager from "./managers/config/ConfigManager";

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
    // Cache all commands and components
    await ComponentManager.cache();
    await CommandManager.cache();

    // Login to Discord
    await client.login(process.env.DISCORD_TOKEN);

    // Mount all event listeners and publish all commands
    await EventListenerManager.mount();
    await CommandManager.publish();

    // Load all configurations
    ConfigManager.loadGlobalConfig();
    await ConfigManager.loadGuildConfigs();

    // Emit ready event again since it was mounted
    // after the client was logged in
    client.emit("ready", client);
}

// Perform closing operations on error
main()
    .catch(error => {
        Sentry.captureException(error);
        process.exit(0);
    });