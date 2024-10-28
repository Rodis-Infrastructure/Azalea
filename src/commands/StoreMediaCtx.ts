import {
	ApplicationCommandType,
	Attachment,
	GuildMember, Message,
	MessageContextMenuCommandInteraction,
	Snowflake,
	userMention
} from "discord.js";

import { InteractionReplyData, Result } from "@utils/types";
import { log } from "@utils/logging";
import { pluralize } from "@/utils";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

export default class StoreMediaCtx extends Command<MessageContextMenuCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "Store media",
			type: ApplicationCommandType.Message
		});
	}

	async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const files: Attachment[] = Array.from(interaction.targetMessage.attachments.values());

		if (!files.length) {
			return {
				content: "This message doesn't have any attachments.",
				temporary: true
			};
		}

		const result = await StoreMediaCtx.storeMedia(interaction.member, interaction.targetMessage.author.id, files, config);

		if (!result.success) {
			return {
				content: result.message,
				temporary: true
			};
		}

		return `Stored \`${files.length}\` ${pluralize(files.length, "attachment")} from ${interaction.targetMessage.author} - ${result.data.join(" ")}`;
	}

	/**
     * Handles storing media in the logging channel
     *
     * @param media - The media to store
     * @param executor - The user who stored the media
     * @param targetId - ID of the user whose media is being stored
     * @param config - The guild configuration
     * @returns The media log URLs
     */
	static async storeMedia(executor: GuildMember | null, targetId: Snowflake, media: Attachment[], config: GuildConfig): Promise<Result<string[]>> {
		const size = media.reduce((acc, file) => acc + file.size, 0);

		if (size > 10_000_000) {
			return {
				success: false,
				message: "Cannot store media larger than 10MB."
			};
		}

		let loggedMessages: Message<true>[] | null;

		try {
			loggedMessages = await log({
				event: LoggingEvent.MediaStore,
				message: {
					content: `Media from ${userMention(targetId)}, stored by ${executor ?? "unknown user"}`,
					allowedMentions: { parse: [] },
					files: media
				},
				channel: null,
				member: executor,
				config
			});
		} catch {
			return {
				success: false,
				message: "Failed to send the media log."
			};
		}

		if (!loggedMessages?.length) {
			return {
				success: false,
				message: "Couldn't find any logging channels to store the media in."
			};
		}

		return {
			success: true,
			data: loggedMessages.map(message => message.url)
		};
	}
}