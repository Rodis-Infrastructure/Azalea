import {
	ApplicationCommandOptionType,
	ChatInputCommandInteraction,
	Colors,
	EmbedBuilder,
	inlineCode
} from "discord.js";

import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";

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

		let url = interaction.options.getString("url", true);

		if (url.startsWith("http://")) {
			url = url.slice(4);
			url = `https${url}`;
		} else if (!url.startsWith("https://")) {
			url = `https://${url}`;
		}

		url = Buffer.from(url).toString("base64"); // Base64 encode the URL

		// Remove padding
		if (url.endsWith("=")) {
			url = url.slice(0, -1);
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

		const data = result.data.attributes;
		const trackers = Object.keys(data.trackers);

		const analysisEmbed = new EmbedBuilder()
			.setTitle("URL Analysis")
			.setFields([
				{
					name: "URL",
					value: inlineCode(data.url),
					inline: true
				},
				{
					name: "Votes",
					value: `Harmless: ${inlineCode(data.total_votes.harmless.toString())}
					Malicious: ${inlineCode(data.total_votes.malicious.toString())}`,
					inline: true
				},
				{
					name: "Trackers",
					value: inlineCode(trackers.join("`, `") || "None"),
					inline: true
				}
			])
			.setFooter({ text: "Powered by VirusTotal" });

		if (
			data.last_analysis_stats.malicious > 0 ||
			(data.total_votes.malicious > data.total_votes.harmless && data.total_votes.malicious > 0)
		) {
			analysisEmbed.setColor(Colors.Red);
			analysisEmbed.setTitle("❗ Potentially Malicious");
		} else if (data.last_analysis_stats.suspicious > 0) {
			analysisEmbed.setColor(Colors.Orange);
			analysisEmbed.setTitle("⚠️ Potentially Suspicious");
		} else {
			analysisEmbed.setColor(Colors.Green);
			analysisEmbed.setTitle("✅ Potentially Harmless");
		}


		if (data.last_analysis_stats.malicious > 0) {
			analysisEmbed.addFields({
				name: "Detected as Malicious By",
				value: Object.entries(data.last_analysis_results)
					.filter(([, { category }]) => category === "malicious")
					.map(([engine]) => inlineCode(engine))
					.join(", ") || "Error"
			});
		}

		if (data.last_analysis_stats.suspicious > 0) {
			analysisEmbed.addFields({
				name: "Detected as Suspicious By",
				value: Object.entries(data.last_analysis_results)
					.filter(([, { category }]) => category === "suspicious")
					.map(([engine]) => inlineCode(engine))
					.join(", ") || "Error"
			});
		}

		if (data.redirection_chain.length > 1) {
			analysisEmbed.addFields({
				name: "Redirection Chain",
				value: `-> ${inlineCode(data.redirection_chain.join("`\n-> `"))}`
			});
		}

		return { embeds: [analysisEmbed] };
	}
}

interface UrlScanResponse {
	data: {
		attributes: {
			url: string;
			redirection_chain: string[];
			last_analysis_stats: {
				harmless: number;
				malicious: number;
				suspicious: number;
				timeout: number;
				failure: number;
			};
			total_votes: {
				harmless: number;
				malicious: number;
			};
			trackers: {
				[tracker: string]: [];
			};
			last_analysis_results: {
				[engine: string]: {
					category: string;
				};
			}
		};
	};
}