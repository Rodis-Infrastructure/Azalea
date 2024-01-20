import { ChatInputCommandInteraction } from "discord.js";
import Command from "../handlers/commands/Command.ts";

export default class Test extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "purge",
            description: "temp"
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
        if (!interaction.channel) return;

        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        await interaction.channel.bulkDelete(messages, true);
    }
}