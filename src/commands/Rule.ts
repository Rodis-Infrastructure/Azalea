import {
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
					name: "number",
					description: "The rule number to display",
					type: ApplicationCommandOptionType.Integer,
					required: true,
					minValue: 1,
					maxValue: config.data.rules.length || 1
				}
			]
		});
	}

	execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const ruleNumber = interaction.options.getInteger("number", true);
		const rules = config.data.rules;

		if (rules.length === 0) {
			return {
				content: "No rules have been configured for this server.",
				ephemeral: true
			};
		}

		if (ruleNumber < 1 || ruleNumber > rules.length) {
			return {
				content: `Invalid rule number. Please choose a number between 1 and ${rules.length}.`,
				ephemeral: true
			};
		}

		const rule = rules[ruleNumber - 1];
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
}
