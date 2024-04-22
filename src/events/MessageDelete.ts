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
    Messages,
    prepareMessageForStorage,
    prependReferenceLog
} from "@utils/messages";

import { channelMentionWithName, userMentionWithId } from "@/utils";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { log } from "@utils/logging";
import { Message } from "@prisma/client";
import { client } from "./..";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import MessageBulkDelete from "./MessageBulkDelete";

export default class MessageDelete extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: PartialMessage | DiscordMessage): Promise<void> {
        if (deletedMessage.author?.bot) return;

        let message = await Messages.delete(deletedMessage.id);
        const isPurged = Messages.purgeQueue.some(purged => purged.messages[0].id === deletedMessage.id);

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
            ? await Messages.get(message.reference_id)
            : null;

        // Ensure the message doesn't exceed the character limit
        // Prior to trying to log it in an embed
        if (
            message.content!.length > EMBED_FIELD_CHAR_LIMIT ||
            (reference?.content && reference.content.length > EMBED_FIELD_CHAR_LIMIT)
        ) {
            await MessageBulkDelete.log([message], channel, config);
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
    const reference = message.reference_id
        ? await Messages.get(message.reference_id)
        : null;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
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
        const messageUrl = messageLink(message.channel_id, message.id, config.guild.id);

        embed.addFields({
            name: "Content",
            value: formatMessageContentForLog(message.content, messageUrl)
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