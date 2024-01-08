import { loadListeners } from "./handlers/events/loader.ts";
import { Client, GatewayIntentBits } from "discord.js";

if (!process.env.DISCORD_TOKEN) {
    throw new Error("No token provided! Configure the DISCORD_TOKEN environment variable.");
}

export const client = new Client({
    intents: [
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.Guilds,
    ],
    partials: []
});

(async () => {
    await loadListeners();
    await client.login(process.env.DISCORD_TOKEN);
})();