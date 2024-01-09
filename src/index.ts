import { loadListeners } from "./handlers/events/loader.ts";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { MessageCache } from "./utils/messages.ts";

if (!process.env.DISCORD_TOKEN) {
    throw new Error("No token provided! Configure the DISCORD_TOKEN environment variable.");
}

// Database client
export const prisma = new PrismaClient();

// Discord client
export const client = new Client({
    intents: [
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.Guilds,
    ],
    partials: [
        Partials.Message
    ]
});

async function main(): Promise<void> {
    await loadListeners();
    await client.login(process.env.DISCORD_TOKEN);
}

// Perform closing operations on error
main()
    .catch(async error => {
        await MessageCache.clear();
        await prisma.$disconnect();

        console.error(error);
        process.exit(1);
    });