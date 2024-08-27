import { ApplicationCommandOptionType, ChatInputCommandInteraction, codeBlock, EmbedBuilder } from "discord.js";
import { DEFAULT_EMBED_COLOR } from "@utils/constants";
import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";

const MAX_RESULTS = 50;

export default class Search extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "search",
            description: "Find a user by their surface name.",
            options: [{
                name: "query",
                description: "The query to search for (case-insensitive).",
                type: ApplicationCommandOptionType.String,
                required: true
            }]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const query = interaction.options.getString("query", true);
        // Set a limit to avoid exceeding the character limit
        const results = await interaction.guild.members.search({ query, limit: MAX_RESULTS });

        if (!results.size) {
            return "No results found.";
        }

        const mappedUsers = [];

        for (const member of results.values()) {
            // Add an "@" to the beginning of the username if the display name is the username
            const surfaceName = member.displayName === member.user.username
                ? `@${member.user.username} (${member.id})`
                : `${member.displayName} (${member.id})`;

            mappedUsers.push(surfaceName);
        }

        const formattedResults = codeBlock(mappedUsers.join("\n"));
        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setTitle(`Results for "${query}"`)
            .setDescription(formattedResults)
            .setFooter({ text: `${results.size}/${MAX_RESULTS} results` });

        return { embeds: [embed] };
    }
}