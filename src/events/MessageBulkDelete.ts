import {
	ActionRowBuilder,
	ButtonBuilder, ButtonStyle,
	Collection,
	Events,
	GuildTextBasedChannel,
	Message as DiscordMessage,
	PartialMessage,
	userMention
} from "discord.js";

import { log, mapLogEntriesToFile } from "@utils/logging";
import { formatBulkMessageLogEntry, Messages } from "@utils/messages";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { getFilePreviewURL, pluralize } from "@/utils";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class MessageBulkDelete extends EventListener {
	constructor() {
		super(Events.MessageBulkDelete);
	}

	async execute(deletedMessages: Collection<Snowflake, PartialMessage | DiscordMessage<true>>, channel: GuildTextBasedChannel): Promise<void> {
		const messages = await Messages.deleteMany(deletedMessages);
		const config = ConfigManager.getGuildConfig(channel.guild.id);

		if (!messages.length || !config) return;

		const purgeIndex = Messages.purgeQueue.findIndex(purged =>
			purged.messages.some(message =>
				messages.some(m => m.id === message.id)
			)
		);

		// Logging is handled by the purge command
		if (purgeIndex !== -1) {
			return;
		} else {
			delete Messages.purgeQueue[purgeIndex];
		}

		MessageBulkDelete.log(messages, channel, config);
	}

	static async log(
		messages: Message[],
		channel: GuildTextBasedChannel,
		config: GuildConfig
	): Promise<DiscordMessage<true>[] | null> {
		const authorMentions: ReturnType<typeof userMention>[] = [];
		const entries: { entry: string, createdAt: Date }[] = [];

		// Format message log entries
		for (const message of messages) {
			const authorMention = userMention(message.author_id);
			const messageEntry = await formatBulkMessageLogEntry(message);
			const subEntries = [messageEntry];

			if (!authorMentions.includes(authorMention)) {
				authorMentions.push(authorMention);
			}

			if (message.reference_id) {
				const reference = await Messages.get(message.reference_id);

				if (reference) {
					const referenceEntry = await formatBulkMessageLogEntry(reference);
					subEntries.unshift(`REF: ${referenceEntry}`);
				}
			}

			entries.push({
				entry: subEntries.join("\n └── "),
				createdAt: message.created_at
			});
		}

		// Sort entries by creation date (newest to oldest)
		entries.sort((a, b) => {
			return b.createdAt.getTime() - a.createdAt.getTime();
		});

		// E.g. Deleted `5` messages in #general by @user1, @user2
		const logContent = `Deleted \`${messages.length}\` ${pluralize(messages.length, "message")} in ${channel} by ${authorMentions.join(", ")}`;
		const mappedEntries = entries.map(({ entry }) => entry);
		const file = mapLogEntriesToFile(mappedEntries);

		const logs = await log({
			event: LoggingEvent.MessageBulkDelete,
			message: {
				allowedMentions: { parse: [] },
				content: logContent,
				files: [file]
			},
			member: null,
			channel,
			config
		});

		if (logs) {
			for (const message of logs) {
				const fileURL = message.attachments.first()!.url;
				const previewURL = getFilePreviewURL(fileURL);

				const refreshFileLink = new ButtonBuilder()
					.setLabel("Refresh Link")
					.setStyle(ButtonStyle.Secondary)
					.setCustomId("message-delete-bulk-refresh-url");

				const openInBrowserURL = new ButtonBuilder()
					.setLabel("Open in Browser")
					.setStyle(ButtonStyle.Link)
					.setURL(previewURL);

				const actionRow = new ActionRowBuilder<ButtonBuilder>()
					.setComponents(refreshFileLink, openInBrowserURL);

				await message.edit({ components: [actionRow] });
			}
		}

		return logs;
	}
}