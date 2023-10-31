import {
    AttachmentPayload,
    AuditLogEvent,
    channelMention,
    Colors,
    EmbedBuilder,
    Events,
    hyperlink,
    Message,
    PartialMessage,
    StickerFormatType,
    userMention
} from "discord.js";

import { formatLogContent, linkToPurgeLog, referenceEmbed, sendLog } from "@bot/utils/logging";
import { isGuildTextBasedChannel, serializeMessage } from "@bot/utils";
import { LoggingEvent } from "@bot/types/config";
import { client } from "@bot/client";

import EventListener from "@bot/handlers/listeners/eventListener";
import Cache from "@bot/utils/cache";

export default class MessageDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageDelete);
    }

    async execute(deletedMessage: Message<true> | PartialMessage): Promise<void> {
        if (!deletedMessage.guildId) return;

        const cache = Cache.get(deletedMessage.guildId);
        cache.requests.delete(deletedMessage.id);

        const fetchedReference = await deletedMessage.fetchReference().catch(() => null) as Message<true> | null;
        const data = await cache.handleDeletedMessage(deletedMessage.id, !fetchedReference);

        const reference = fetchedReference
            ? serializeMessage(fetchedReference)
            : data.reference;

        const message = !deletedMessage.partial
            ? serializeMessage(deletedMessage, true)
            : data.message;

        if (!message) return;

        const sourceChannel = await client.channels.fetch(message.channel_id).catch(() => null);
        if (!sourceChannel || !isGuildTextBasedChannel(sourceChannel)) return;

        const messageDeleteLog = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Message Deleted", iconURL: "attachment://messageDelete.png" })
            .setFields([
                {
                    name: "Author",
                    value: `${userMention(message.author_id)} (\`${message.author_id}\`)`
                },
                {
                    name: "Channel",
                    value: channelMention(message.channel_id)
                },
                {
                    name: "Content",
                    value: formatLogContent(message.content)
                }
            ])
            .setTimestamp();

        const fetchedAuditLogs = await sourceChannel.guild.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 1
        });

        const auditLog = fetchedAuditLogs.entries.first();

        if (auditLog && auditLog.targetId === message.author_id && auditLog.executor) {
            messageDeleteLog.setFooter({
                text: `Deleted by: ${auditLog.executor.tag} • ${auditLog.executor.id}`,
                iconURL: auditLog.executor.displayAvatarURL()
            });
        }

        if (message.sticker_id) {
            const sticker = await client.fetchSticker(message.sticker_id).catch(() => null);

            // Lottie stickers don't have an image URL
            if (sticker && sticker.format !== StickerFormatType.Lottie) {
                messageDeleteLog.spliceFields(2, 0, {
                    name: "Sticker",
                    value: `\`${sticker.name}\` (${hyperlink("view", sticker.url)})`
                });
            }
        }

        const embeds = [messageDeleteLog];
        const files: AttachmentPayload[] = [{
            attachment: "./icons/messageDelete.png",
            name: "messageDelete.png"
        }];

        // Message is a reply to another message
        if (reference) {
            const { embed, file } = await referenceEmbed(reference, !fetchedReference);

            embeds.unshift(embed);
            files.push(file);
        }

        const log = await sendLog({
            event: LoggingEvent.Message,
            options: { embeds, files },
            sourceChannel
        });

        if (!log) return;

        await linkToPurgeLog({
            data: message.message_id,
            guildId: message.guild_id,
            url: log.url
        });
    }
}