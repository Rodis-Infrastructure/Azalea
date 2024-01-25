import { Client, GatewayIntentBits, Partials } from "discord.js";
import { loadListeners } from "./handlers/events/loader.ts";
import { EXIT_EVENTS } from "./utils/constants.ts";
import { PrismaClient } from "@prisma/client";
import { handleProcessExit } from "./utils";

import Sentry from "@sentry/node";

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

// Discord client
export const client = new Client({
    intents: [
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.Guilds
    ],
    partials: [
        Partials.Reaction,
        Partials.Message
    ]
});

async function main(): Promise<void> {
    const transaction = Sentry.startInactiveSpan({
        name: "Initialize bot",
        op: "init"
    })!;

    await loadListeners();
    await client.login(process.env.DISCORD_TOKEN);

    transaction.end();
}

// Perform closing operations on error
main()
    .catch(error => {
        Sentry.captureException(error);
        process.exit(0);
    });