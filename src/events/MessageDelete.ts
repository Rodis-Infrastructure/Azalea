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
    fetchPartialMessageData,
    formatMessageContentForLog,
    MessageCache,
    prepareMessageForStorage,
    prependReferenceLog
} from "../utils/messages.ts";

import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { handleMessageBulkDeleteLog } from "./MessageBulkDelete.ts";
import { log } from "../utils/logging.ts";
import { Message } from "@prisma/client";
import { client } from "../index.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: PartialMessage | DiscordMessage): Promise<void> {
        let message: Message | null = null;

        if (deletedMessage.partial) {
            message = await MessageCache.delete(deletedMessage.id);
        } else if (deletedMessage.inGuild()) {
            message = prepareMessageForStorage(deletedMessage);
        }

        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guild_id);
        if (!config) return;

        // Log messages that exceed the field character limit in a text file
        if (message.content.length <= 1000) {
            await handleMessageDeleteLog(message, config);
        } else {
            const sourceChannel = await client.channels.fetch(message.channel_id) as GuildTextBasedChannel | null;
            if (!sourceChannel) return;

            await handleMessageBulkDeleteLog([message], sourceChannel, config);
        }
    }
}

async function handleMessageDeleteLog(message: Message, config: GuildConfig): Promise<void> {
    const [author, sourceChannel] = await fetchPartialMessageData(config.guild, message.author_id, message.channel_id);

    // Member roles and the source channel are required to perform scope checks
    if (!author || !sourceChannel) return;

    const messageURL = messageLink(message.channel_id, message.message_id, config.guild.id);
    const maskedJumpURL = hyperlink("Jump to location", messageURL);

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setDescription(maskedJumpURL)
        .setFields([
            { name: "Author", value: `${userMention(message.author_id)} (\`${message.author_id}\`)` },
            { name: "Channel", value: `${channelMention(sourceChannel.id)} (\`#${sourceChannel.name}\`)` }
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

    if (message.reference_id) {
        await prependReferenceLog(message.reference_id, embeds);
    }

    await log({
        event: LoggingEvent.MessageDelete,
        channel: sourceChannel,
        message: { embeds },
        member: author,
        config
    });
}