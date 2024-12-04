import {
	ApplicationCommandOptionType,
	ChatInputCommandInteraction,
	EmbedBuilder,
	version as djsVersion
} from "discord.js";

import { DEFAULT_EMBED_COLOR } from "@utils/constants";
import { InteractionReplyData } from "@utils/types";
import { humanizeTimestamp } from "@/utils";
import { client } from "./..";

import Command from "@managers/commands/Command";

export default class Process extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "process",
			description: "Displays information about the process and the bot.",
			options: [{
				name: "info",
				description: "Display information about the process and the bot.",
				type: ApplicationCommandOptionType.Subcommand
			}]
		});
	}

	execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand !== "info") {
			throw new Error(`Unknown subcommand: ${subcommand}`);
		}

		// Node.js process uptime
		const msProcessUptime = Math.floor(process.uptime() * 1000);
		const strProcessUptime = humanizeTimestamp(msProcessUptime);

		// Discord.js client uptime
		const msClientUptime = Math.floor(client.uptime);
		const strClientUptime = humanizeTimestamp(msClientUptime);

		// Discord.js ping
		const msPing = Math.round(client.ws.ping);

		// Memory usage
		const memoryUsage = process.memoryUsage();
		const heapUsed = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
		const heapTotal = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);

		const embed = new EmbedBuilder()
			.setColor(DEFAULT_EMBED_COLOR)
			// Apps still use discriminators, so we use .tag instead of .username
			.setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL() })
			.setFields([
				{
					name: "Process Uptime",
					value: strProcessUptime,
					inline: true
				},
				{
					name: "Client Uptime",
					value: strClientUptime,
					inline: true
				},
				{
					name: "Ping",
					value: `${msPing}ms`,
					inline: true
				},
				{
					name: "Memory Usage",
					value: `${heapUsed} MB / ${heapTotal} MB`,
					inline: true
				},
				{
					name: "Node.js Version",
					value: process.version,
					inline: true
				},
				{
					name: "Discord.js Version",
					value: djsVersion,
					inline: true
				}
			])
			.setFooter({ text: `Client ID: ${client.user.id}` })
			.setTimestamp();

		return { embeds: [embed] };
	}
}