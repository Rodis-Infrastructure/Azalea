import {
    ApplicationCommandType,
    Attachment, GuildMember,
    MessageContextMenuCommandInteraction,
    Snowflake,
    userMention
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { log } from "@utils/logging";
import { pluralize } from "@/utils";
import { MediaStoreError } from "@utils/errors";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Sentry from "@sentry/node";

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

        try {
            const logURLs = await StoreMediaCtx.storeMedia(interaction.member, interaction.targetMessage.author.id, files, config);
            return `Stored \`${files.length}\` ${pluralize(files.length, "attachment")} from ${interaction.targetMessage.author} - ${logURLs.join(" ")}`;
        } catch (error) {
            if (error instanceof MediaStoreError) {
                return {
                    content: error.message,
                    temporary: true
                };
            }

            Sentry.captureException(error, {
                extra: {
                    message: "Failed to store media",
                    executor: interaction.user.id,
                    target: interaction.targetMessage.author.id,
                    files
                }
            });

            return {
                content: "An error occurred while storing the media.",
                temporary: true
            };
        }
    }

    /**
     * Handles storing media in the logging channel
     *
     * @param media - The media to store
     * @param executor - The user who stored the media
     * @param targetId - ID of the user whose media is being stored
     * @param config - The guild configuration
     * @throws MediaStoreError - If the media size exceeds 10MB
     * @returns The media log URLs
     */
    static async storeMedia(executor: GuildMember | null, targetId: Snowflake, media: Attachment[], config: GuildConfig): Promise<string[]> {
        const size = media.reduce((acc, file) => acc + file.size, 0);

        if (size > 10_000_000) {
            throw new MediaStoreError("Cannot store media larger than 10MB.");
        }

        const loggedMessages = await log({
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

        if (!loggedMessages?.length) {
            throw new MediaStoreError("Failed to store media.");
        }

        return loggedMessages.map(message => message.url);
    }
}