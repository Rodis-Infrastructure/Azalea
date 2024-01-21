import {
    channelMention,
    Colors,
    EmbedBuilder,
    Events,
    GuildTextBasedChannel,
    hyperlink,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    StickerFormatType,
    userMention
} from "discord.js";

import {
    formatMessageContentForLog,
    MessageCache,
    prepareMessageForStorage,
    prependReferenceLog
} from "../utils/messages.ts";

import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { handleMessageBulkDeleteLog } from "./MessageBulkDelete.ts";
import { EMBED_FIELD_CHAR_LIMIT } from "../utils/constants.ts";
import { log } from "../utils/logging.ts";
import { Message } from "@prisma/client";
import { client } from "../index.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: PartialMessage | DiscordMessage): Promise<void> {
        let message = await MessageCache.delete(deletedMessage.id);

        if (!message && !deletedMessage.partial && deletedMessage.inGuild()) {
            message = prepareMessageForStorage(deletedMessage);
        }

        if (!message?.content) return;

        const config = ConfigManager.getGuildConfig(message.guild_id);
        if (!config) return;

        await handleMessageDeleteLog(message, config).catch(() => null);
    }
}

async function handleMessageDeleteLog(message: Message, config: GuildConfig): Promise<void> {
    const channel = await client.channels.fetch(message.channel_id).catch(() => null) as GuildTextBasedChannel | null;
    if (!channel) return;

    const reference = message.reference_id
        ? await MessageCache.get(message.reference_id)
        : null;

    if (
        message.content!.length > EMBED_FIELD_CHAR_LIMIT ||
        (reference?.content && reference.content.length > EMBED_FIELD_CHAR_LIMIT)
    ) {
        await handleMessageBulkDeleteLog([message], channel, config);
        return;
    }

    await handleMessageShortDeleteLog(message, channel, config);
}

async function handleMessageShortDeleteLog(message: Message, channel: GuildTextBasedChannel, config: GuildConfig): Promise<void> {
    const messageURL = messageLink(message.channel_id, message.message_id, config.guild.id);
    const maskedJumpURL = hyperlink("Jump to location", messageURL);

    const reference = message.reference_id
        ? await MessageCache.get(message.reference_id)
        : null;

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setDescription(maskedJumpURL)
        .setFields([
            { name: "Author", value: `${userMention(message.author_id)} (\`${message.author_id}\`)` },
            { name: "Channel", value: `${channelMention(channel.id)} (\`#${channel.name}\`)` }
        ])
        .setTimestamp(message.created_at);

    // Messages with stickers don't have content
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
    } else {
        embed.addFields({
            name: "Content",
            value: formatMessageContentForLog(message.content)
        });
    }

    const embeds = [embed];

    if (reference) {
        await prependReferenceLog(reference, embeds);
    }

    await log({
        event: LoggingEvent.MessageDelete,
        message: { embeds },
        channel,
        config
    });
}