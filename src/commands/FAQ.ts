import {
    ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    User
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
        const selected = interaction.options.getString("query", true);
        const mention = interaction.options.getUser("mention");
        const response = FAQ._getResponse(selected, config);

        if (!response) {
            return {
                content: "Response not found.",
                ephemeral: true,
                temporary: true
            };
        }

        return FAQ._parseResponse(response, mention);
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

    private static _getResponse(query: string, config: GuildConfig): InteractionReplyData {
        return config.data.quick_responses.find(response => response.value === query)?.response ?? null;
    }

    private static _formatResponse(mention: User | null, response?: string): string | undefined {
        return [mention, response]
            .filter(Boolean)
            .join(" ") || undefined;
    }

    private static _parseResponse(response: Exclude<InteractionReplyData, null>, mention: User | null): InteractionReplyData {
        if (typeof response === "string") {
            return {
                content: FAQ._formatResponse(mention, response),
                allowedMentions: { parse: ["users"] },
                ephemeral: false
            };
        }

        return {
            ...response,
            content: FAQ._formatResponse(mention, response.content),
            allowedMentions: { parse: ["users"] },
            ephemeral: false
        };
    }
}