import {
    Colors,
    EmbedBuilder,
    Events,
    GuildTextBasedChannel,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    StickerFormatType
} from "discord.js";

import {
    formatMessageContentForLog,
    MessageCache,
    prepareMessageForStorage,
    prependReferenceLog
} from "@utils/messages";

import { channelMentionWithName, userMentionWithId } from "@/utils";
import { handleMessageBulkDeleteLog } from "./MessageBulkDelete";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { log } from "@utils/logging";
import { Message } from "@prisma/client";
import { client } from "./..";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: PartialMessage | DiscordMessage): Promise<void> {
        if (deletedMessage.author?.bot) return;

        let message = await MessageCache.delete(deletedMessage.id);
        const isPurged = MessageCache.purgeQueue.some(purged => purged.messages[0].id === deletedMessage.id);

        // Handled by the purge command
        if (isPurged) return;

        // Serialize the message passed by the event
        // If there is sufficient data
        if (!message && !deletedMessage.partial && deletedMessage.inGuild()) {
            message = prepareMessageForStorage(deletedMessage);
        }

        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guild_id);
        if (!config) return;

        this.handleMessageDeleteLog(message, config).catch(() => null);
    }

    async handleMessageDeleteLog(message: Message, config: GuildConfig): Promise<void> {
        const channel = await client.channels.fetch(message.channel_id).catch(() => null) as GuildTextBasedChannel | null;
        if (!channel) return;

        const reference = message.reference_id
            ? await MessageCache.get(message.reference_id)
            : null;

        // Ensure the message doesn't exceed the character limit
        // Prior to trying to log it in an embed
        if (
            message.content!.length > EMBED_FIELD_CHAR_LIMIT ||
            (reference?.content && reference.content.length > EMBED_FIELD_CHAR_LIMIT)
        ) {
            await handleMessageBulkDeleteLog([message], channel, config);
            return;
        }

        await handleShortMessageDeleteLog(message, channel, config);
    }
}

/**
 * Handles logging messages that do not exceed the embed character limit
 *
 * @param message - The message to log
 * @param channel - The channel the message was deleted in
 * @param config - The guild's configuration
 */
export async function handleShortMessageDeleteLog(
    message: Message,
    channel: GuildTextBasedChannel,
    config: GuildConfig
): Promise<DiscordMessage<true>[] | null> {
    const messageURL = messageLink(message.channel_id, message.id, config.guild.id);
    const maskedJumpURL = hyperlink("Jump to location", messageURL);

    const reference = message.reference_id
        ? await MessageCache.get(message.reference_id)
        : null;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setDescription(maskedJumpURL)
        .setFields([
            { name: "Author", value: userMentionWithId(message.author_id) },
            { name: "Channel", value: channelMentionWithName(channel) }
        ])
        .setTimestamp(message.created_at);

    if (message.sticker_id) {
        const sticker = await client.fetchSticker(message.sticker_id).catch(() => null);

        if (sticker) {
            let fieldValue = `\`${sticker.name}\``;

            // Lottie stickers don't have a URL
            if (sticker.format !== StickerFormatType.Lottie) {
                const stickerURL = hyperlink("view", sticker.url);
                fieldValue += ` (${stickerURL})`;
            }

            embed.addFields({
                name: "Sticker",
                value: fieldValue
            });
        }
    }

    if (message.content) {
        embed.addFields({
            name: "Content",
            value: formatMessageContentForLog(message.content)
        });
    }

    const embeds = [embed];

    if (reference) {
        await prependReferenceLog(reference, embeds);
    }

    return log({
        event: LoggingEvent.MessageDelete,
        message: { embeds },
        channel,
        config
    });
}