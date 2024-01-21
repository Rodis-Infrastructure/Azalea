import { loadListeners } from "./handlers/events/loader.ts";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { handleProcessExit } from "./utils";
import { EXIT_EVENTS } from "./utils/constants.ts";

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
    await loadListeners();
    await client.login(process.env.DISCORD_TOKEN);
}

// Perform closing operations on error
main()
    .catch(error => {
        console.error(error);
        process.exit(0);
    });