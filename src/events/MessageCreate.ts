import { Messages, resolvePartialMessage, temporaryReply } from "@utils/messages";
import { handleModerationRequest } from "@utils/requests";
import { Events, Message, PartialMessage } from "discord.js";
import { handleMediaStore } from "@/commands/StoreMediaCtx";
import { MediaStoreError } from "@utils/errors";
import { pluralize } from "@/utils";

import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import Sentry from "@sentry/node";

export default class MessageCreateEventListener extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(newMessage: PartialMessage | Message): Promise<void> {
        const message = await resolvePartialMessage(newMessage);
        if (!message || message.author.bot) return;

        Messages.set(message);

        const config = ConfigManager.getGuildConfig(message.guild.id);
        if (!config) return;

        // Handle media conversion
        if (
            message.channel.id === config.data.media_conversion_channel &&
            message.attachments.size &&
            !message.content
        ) {
            try {
                const media = Array.from(message.attachments.values());
                const logUrls = await handleMediaStore(message.author.id, message.author.id, media, config);

                message.reply(`Stored \`${media.length}\` ${pluralize(media.length, "attachment")} - ${logUrls.join(" ")}`);
            } catch (error) {
                if (error instanceof MediaStoreError) {
                    temporaryReply(message, error.message, config.data.response_ttl);
                } else {
                    Sentry.captureException(error);
                    temporaryReply(message, "An error occurred while converting media..", config.data.response_ttl);
                }
            }
        }

        const autoReactionEmojis = config.getAutoReactionEmojis(message.channel.id);

        // Add auto reactions to the message
        for (const emoji of autoReactionEmojis) {
            message.react(emoji).catch(() => null);
        }

        // Remove message if it doesn't have an attachment in a media channel
        if (config.data.media_channels.includes(message.channel.id) && !message.attachments.size) {
            await temporaryReply(message, "This is a media-only channel, please include an attachment in your message.", config.data.response_ttl);
            message.delete().catch(() => null);
        }

        // Source channel conditions are handled within the function
        handleModerationRequest(message, config);
    }
}