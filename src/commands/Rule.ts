import {
	ApplicationCommandOptionChoiceData,
	ApplicationCommandOptionType,
	ChatInputCommandInteraction,
	Colors,
	EmbedBuilder
} from "discord.js";

import { InteractionReplyData } from "@utils/types";

import GuildCommand from "@managers/commands/GuildCommand";
import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";

export default class Rule extends GuildCommand<ChatInputCommandInteraction<"cached">> {
	constructor(config: GuildConfig) {
		super(config, {
			name: "rule",
			description: "Display a server rule",
			options: [
				{
					name: "rule",
					description: "The rule to display",
					type: ApplicationCommandOptionType.String,
					required: true,
					choices: Rule._getChoices(config)
				}
			]
		});
	}

	execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const ruleIndex = parseInt(interaction.options.getString("rule", true));
		const rules = config.data.rules;

		if (isNaN(ruleIndex) || ruleIndex < 0 || ruleIndex >= rules.length) {
			return {
				content: "Rule not found.",
				ephemeral: true
			};
		}

		const rule = rules[ruleIndex];
		const ruleNumber = ruleIndex + 1;
		const rulesChannelId = config.data.rules_channel_id;

		const rulesChannelMention = rulesChannelId ? `<#${rulesChannelId}>` : "the rules channel";

		const embed = new EmbedBuilder()
			.setColor(Colors.Yellow)
			.setAuthor({ name: "Server Rule Reminder" })
			.setTitle(`Rule ${ruleNumber}: ${rule.title}`)
			.setDescription(`${rule.content}\n\n*Please follow our server rules. View all rules in ${rulesChannelMention}.*`);

		return {
			embeds: [embed],
			ephemeral: false
		};
	}

	/**
	 * Get rule choices to pass to the command's options.
	 *
	 * @param config - The guild config
	 * @returns The rule choices
	 * @private
	 */
	private static _getChoices(config: GuildConfig): ApplicationCommandOptionChoiceData<string>[] | undefined {
		const choices = config.data.rules.map((rule, index) => ({
			name: `${index + 1} - ${rule.title}`.slice(0, 100),
			value: index.toString()
		}));

		return choices.length ? choices : undefined;
	}
}
