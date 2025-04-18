import {
	Colors,
	EmbedBuilder,
	Events,
	hyperlink,
	Message as DiscordMessage,
	MessageCreateOptions,
	PartialMessage
} from "discord.js";

import {
	prependReferenceLog,
	formatMessageContentForShortLog,
	Messages,
	formatBulkMessageLogEntry
} from "@utils/messages";

import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { Message } from "@prisma/client";
import { cleanContent } from "@/utils";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import MuteRequestUtil from "@utils/muteRequests";
import BanRequestUtil from "@utils/banRequests";

export default class MessageUpdate extends EventListener {
	constructor() {
		super(Events.MessageUpdate);
	}

	async execute(_oldMessage: never, newMessage: PartialMessage | DiscordMessage<true>): Promise<void> {
		const message = newMessage.partial
			? await newMessage.fetch().catch(() => null) as DiscordMessage<true> | null
			: newMessage;

		// Terminate if the message can't be fetched or if there is no content
		if (!message || message.author.bot || !message.content) return;

		// The message was edited in the last 5 seconds
		const isRecent = !message.editedTimestamp || Date.now() - message.editedTimestamp < 5000;
		if (!isRecent) return;

		const config = ConfigManager.getGuildConfig(message.guildId);
		if (!config) return;

		const newContent = cleanContent(message.content, message.channel);
		const oldContent = await Messages.updateContent(message.id, newContent);

		// Only proceed if the message content was changed
		if (oldContent === newContent) return;

		MessageUpdate._log(message, oldContent, config).catch(() => null);

		// Handle updated mute request
		if (message.channelId === config.data.mute_requests?.channel_id) {
			await MuteRequestUtil.upsert(message, config);
		}

		// Handle updated ban request
		if (message.channelId === config.data.ban_requests?.channel_id) {
			await BanRequestUtil.upsert(message, config);
		}
	}

	private static async _log(message: DiscordMessage<true>, oldContent: string, config: GuildConfig): Promise<void> {
		const reference = message.reference?.messageId
			? await Messages.get(message.reference.messageId)
			: null;

		const newContent = cleanContent(message.content, message.channel);
		let logContent: MessageCreateOptions | null;

		if (
			oldContent.length > EMBED_FIELD_CHAR_LIMIT ||
            newContent.length > EMBED_FIELD_CHAR_LIMIT ||
            (reference?.content && reference.content.length > EMBED_FIELD_CHAR_LIMIT)
		) {
			logContent = await MessageUpdate._getLongLogContent(message, reference, oldContent);
		} else {
			logContent = await MessageUpdate._getShortLogContent(message, reference, oldContent);
		}

		if (!logContent) return;

		log({
			event: LoggingEvent.MessageUpdate,
			message: logContent,
			channel: message.channel,
			member: message.member,
			config
		});
	}

	// @returns The log message
	private static async _getShortLogContent(
		message: DiscordMessage<true>,
		reference: Message | null,
		oldContent: string
	): Promise<MessageCreateOptions | null> {
		const serializedMessage = Messages.serialize(message);
		const formattedOldContent = await formatMessageContentForShortLog(oldContent, null, message.url);
		const formattedNewContent = await formatMessageContentForShortLog(serializedMessage.content, null, message.url);

		const embed = new EmbedBuilder()
			.setColor(Colors.Orange)
			.setAuthor({ name: "Message Updated" })
			.setFields([
				{ name: "Author", value: `${message.author} (\`${message.author.id}\`)` },
				{ name: "Channel", value: `${message.channel} (\`#${message.channel.name}\`)` },
				{ name: "Content (Before)", value: formattedOldContent },
				{ name: "Content (After)", value: formattedNewContent }
			])
			.setTimestamp();

		const embeds = [embed];

		if (reference) {
			await prependReferenceLog(reference, embeds);
		}

		return { embeds };
	}

	// @returns The log message
	private static async _getLongLogContent(
		message: DiscordMessage<true>,
		reference: Message | null,
		oldContent: string
	): Promise<MessageCreateOptions | null> {
		const serializedMessage = Messages.serialize(message);
		const entry = await MessageUpdate._formatLogEntry(serializedMessage, reference, oldContent);
		const file = mapLogEntriesToFile([entry]);
		const maskedJumpURL = hyperlink("Jump to message", `<${message.url}>`);

		return {
			content: `Updated message in ${message.channel} by ${message.author} (${maskedJumpURL})`,
			allowedMentions: { parse: [] },
			files: [file]
		};
	}

	private static async _formatLogEntry(message: Message, reference: Message | null, oldContent: string): Promise<string> {
		const [oldMessageEntry, newMessageEntry] = await Promise.all([
			formatBulkMessageLogEntry({ ...message, content: oldContent }),
			formatBulkMessageLogEntry({ ...message, created_at: new Date() })
		]);

		const entries = [
			`A: ${oldMessageEntry}`,
			`B: ${newMessageEntry}`
		];

		if (reference) {
			const referenceEntry = await formatBulkMessageLogEntry(reference);
			entries.unshift(`REF: ${referenceEntry}`);
		}

		// There is no reference
		if (entries.length === 2) {
			return entries.join("\n");
		}

		// There is a reference
		return entries.join("\n └── ");
	}
}