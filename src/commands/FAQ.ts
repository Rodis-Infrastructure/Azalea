import {
    ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction
} from "discord.js";

import { InteractionReplyData } from "@utils/types";

import GuildCommand from "@managers/commands/GuildCommand";
import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";

export default class FAQ extends GuildCommand<ChatInputCommandInteraction<"cached">> {
    constructor(config: GuildConfig) {
        super(config, {
            name: "faq",
            description: "Send quick responses",
            options: [{
                name: "query",
                description: "The response to send",
                type: ApplicationCommandOptionType.String,
                choices: FAQ._getChoices(config),
                required: true
            }]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const choice = interaction.options.getString("query", true);
        const response = config.getQuickResponse(choice);

        if (!response) {
            return {
                content: "Failed to find the response",
                ephemeral: true
            };
        }

        return response;
    }

    private static _getChoices(config: GuildConfig): ApplicationCommandOptionChoiceData<string>[] | undefined {
        const choices = config.data.quick_responses.map(response => ({
            name: response.label,
            value: response.value
        }));

        return choices.length ? choices : undefined;
    }
}