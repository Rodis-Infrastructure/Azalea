import {
    ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction
} from "discord.js";

import { InteractionReplyData } from "@utils/types";

import GuildCommand from "@managers/commands/GuildCommand";
import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";

// A command that sends pre-configured responses.
export default class FAQ extends GuildCommand<ChatInputCommandInteraction<"cached">> {
    constructor(config: GuildConfig) {
        super(config, {
            name: "faq",
            description: "Send quick responses",
            options: [
                {
                    name: "query",
                    description: "The response to send",
                    type: ApplicationCommandOptionType.String,
                    choices: FAQ._getChoices(config),
                    required: true
                },
                {
                    name: "mention",
                    description: "The user to mention in the response",
                    type: ApplicationCommandOptionType.User
                }
            ]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const choice = interaction.options.getString("query", true);
        const mention = interaction.options.getUser("mention");
        let response = config.getQuickResponse(choice);

        if (!response) {
            return {
                content: "Response not found",
                ephemeral: true
            };
        }

        if (typeof response === "string") {
            // Prepend the mention to the response
            response = mention
                ? `${mention} ${response}`
                : response;

            return {
                content: response,
                ephemeral: false
            };
        }

        // Prepend the mention to the response content
        response.content = mention
            ? `${mention} ${response.content || ""}`
            : response.content;

        return {
            ...response,
            ephemeral: false
        };
    }

    /**
     * Get quick response choices to pass to the command's options.
     *
     * @param config - The guild config
     * @returns The quick response choices
     * @private
     */
    private static _getChoices(config: GuildConfig): ApplicationCommandOptionChoiceData<string>[] | undefined {
        const choices = config.data.quick_responses.map(response => ({
            name: response.label,
            value: response.value
        }));

        return choices.length ? choices : undefined;
    }
}