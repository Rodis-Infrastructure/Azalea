import {
    ApplicationCommandType,
    Attachment,
    MessageContextMenuCommandInteraction,
    Snowflake,
    userMention
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { log } from "@utils/logging";
import { pluralize } from "@/utils";
import { MediaStoreError } from "@utils/errors";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Sentry from "@sentry/node";

export default class StoreMediaCtx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Store Media",
            type: ApplicationCommandType.Message
        });
    }

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const files: Attachment[] = Array.from(interaction.targetMessage.attachments.values());

        if (!files.length) {
            return "This message doesn't have any attachments.";
        }

        try {
            const logURLs = await handleMediaStore(interaction.user.id, interaction.targetMessage.author.id, files, config);
            return `Stored \`${files.length}\` ${pluralize(files.length, "attachment")} from ${interaction.targetMessage.author} - ${logURLs.join(" ")}`;
        } catch (error) {
            if (error instanceof MediaStoreError) {
                return error.message;
            }

            Sentry.captureException(error, {
                extra: {
                    message: "Failed to store media",
                    executor: interaction.user.id,
                    target: interaction.targetMessage.author.id,
                    files
                }
            });

            return "An error occurred while storing the media.";
        }
    }
}

/**
 * Handles storing media in the logging channel
 *
 * @param media - The media to store
 * @param executorId - ID of the user who stored the media
 * @param targetId - ID of the user whose media is being stored
 * @param config - The guild configuration
 * @returns - The media log URLs
 */
export async function handleMediaStore(executorId: Snowflake, targetId: Snowflake, media: Attachment[], config: GuildConfig): Promise<string[]> {
    const loggedMessages = await log({
        event: LoggingEvent.MediaStore,
        message: {
            content: `Media from ${userMention(targetId)}, stored by ${userMention(executorId)}`,
            allowedMentions: { parse: [] },
            files: media
        },
        channel: null,
        config
    });

    if (!loggedMessages?.length) {
        throw new MediaStoreError("Failed to store media.");
    }

    return loggedMessages.map(message => message.url);
}