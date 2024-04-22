import {
    ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    PermissionFlagsBits
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
            defaultMemberPermissions: [PermissionFlagsBits.ManageMessages],
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
                content: "Response not found",
                ephemeral: true
            };
        }

        return response;
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