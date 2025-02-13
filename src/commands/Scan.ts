import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	inlineCode
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { formatEmojiUrl } from "@/utils";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";

const VIRUSTOTAL_API_ENDPOINT = "https://www.virustotal.com/api/v3/urls/";

export default class Scan extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "scan",
			description: "Scan a URL for malicious content.",
			options: [{
				name: "url",
				description: "Scan a URL for malicious content.",
				type: ApplicationCommandOptionType.Subcommand,
				options: [{
					name: "url",
					description: "The URL to scan.",
					type: ApplicationCommandOptionType.String,
					required: true
				}]
			}]
		});
	}

	async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const apiKey = process.env.VIRUSTOTAL_API_KEY;

		if (!apiKey) {
			return "The bot maintainer has not set up the VirusTotal API key.";
		}

		let url = interaction.options.getString("url", true).trim();

		if (url.startsWith("http://")) {
			url = url.slice(4);
			url = `https${url}`;
		} else if (!url.startsWith("https://")) {
			url = `https://${url}`;
		}

		url = Buffer.from(url).toString("base64"); // Base64 encode the URL

		// Remove all end padding
		for (let i = url.length - 1; i > 0; i--) {
			if (url[i] !== "=") {
				url = url.slice(0, i + 1);
				break;
			}
		}

		url = `${VIRUSTOTAL_API_ENDPOINT}${url}`;

		const response = await fetch(url, {
			method: "GET",
			/* eslint-disable @typescript-eslint/naming-convention */
			headers: {
				"X-Apikey": apiKey,
				"Content-Type": "application/json",
				Accept: "application/json"
			}
			/* eslint-enable */
		});

		if (!response.ok) {
			const status = inlineCode(`${response.status} ${response.statusText}`);
			return `An error occurred while fetching the URL scan data: ${status}`;
		}

		const result = await response.json()
			.then(result => result as UrlScanResponse)
			.catch(() => null);

		if (!result) {
			return "An error occurred while parsing the URL scan data.";
		}

		const emoji = ConfigManager.getGuildConfig(interaction.guildId, true).data.client_emojis;
		const data = result.data.attributes;
		const trackers = Object.keys(data.trackers ?? {});

		const analysisEmbed = new EmbedBuilder()
			.setFields([
				{
					name: "URL",
					value: inlineCode(data.url),
					inline: true
				},
				{
					name: "Final URL",
					value: inlineCode(data.last_final_url),
					inline: true
				},
				{
					name: "Tags",
					value: inlineCode(data.tags.join("`, `") || "None"),
					inline: true
				},
				{
					name: "Trackers",
					value: inlineCode(trackers.join("`, `") || "None"),
					inline: true
				}
			])
			.setFooter({ text: "Results may be inaccurate." });

		if (data.last_analysis_stats.malicious > 0) {
			analysisEmbed.setColor("#FF5A50");
			if (emoji.alert) {
				analysisEmbed.setAuthor({
					name: "Malicious",
					iconURL: formatEmojiUrl(emoji.alert)
				});
			} else {
				analysisEmbed.setTitle("❗ Malicious");
			}
		} else if (data.last_analysis_stats.suspicious > 0) {
			analysisEmbed.setColor("#FFED2E");
			if (emoji.warning) {
				analysisEmbed.setAuthor({
					name: "Suspicious",
					iconURL: formatEmojiUrl(emoji.warning)
				});
			} else {
				analysisEmbed.setTitle("⚠️ Suspicious");
			}
		} else {
			analysisEmbed.setColor("#27C6A3");
			if (emoji.checkmark) {
				analysisEmbed.setAuthor({
					name: "Harmless",
					iconURL: formatEmojiUrl(emoji.checkmark)
				});
			} else {
				analysisEmbed.setTitle("✅ Harmless");
			}
		}

		if (data.last_analysis_stats.malicious > 0 || data.last_analysis_stats.suspicious > 0) {
			const malicious = [];
			const suspicious = [];

			for (const [engine, { category }] of Object.entries(data.last_analysis_results)) {
				switch (category) {
					case "malicious":
						malicious.push(engine);
						break;
					case "suspicious":
						suspicious.push(engine);
						break;
				}
			}

			if (malicious.length > 0) {
				analysisEmbed.addFields({
					name: "Flagged as Malicious By",
					value: malicious.map(inlineCode).join(", ") || "None",
					inline: true
				});
			}

			if (suspicious.length > 0) {
				analysisEmbed.addFields({
					name: "Flagged as Suspicious By",
					value: suspicious.map(inlineCode).join(", ") || "None",
					inline: true
				});
			}
		}

		const onlineReportUrl = `https://virustotal.com/gui/url/${result.data.id}`;
		const fullReportButton = new ButtonBuilder()
			.setLabel("View Full Report")
			.setStyle(ButtonStyle.Link)
			.setURL(onlineReportUrl);
		const actionRow = new ActionRowBuilder<ButtonBuilder>()
			.setComponents(fullReportButton);

		return {
			embeds: [analysisEmbed],
			components: [actionRow]
		};
	}
}

interface UrlScanResponse {
	data: {
		id: string,
		attributes: {
			url: string;
			last_final_url: string;
			tags: string[];
			last_analysis_stats: {
				harmless: number;
				malicious: number;
				suspicious: number;
				timeout: number;
				failure: number;
			};
			trackers?: {
				[tracker: string]: string[];
			};
			last_analysis_results: {
				[engine: string]: {
					category: string;
				};
			}
		};
	};
}