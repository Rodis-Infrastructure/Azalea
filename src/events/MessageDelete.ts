import {
    AuditLogEvent,
    Colors,
    EmbedBuilder,
    Events,
    Guild,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    messageLink,
    PartialMessage,
    Snowflake,
    User
} from "discord.js";

import {
    formatMessageContentForShortLog,
    Messages,
    prependReferenceLog
} from "@utils/messages";

import { channelMentionWithName, userMentionWithId } from "@/utils";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { log } from "@utils/logging";
import { Message } from "@prisma/client";
import { client, prisma } from "./..";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import MessageBulkDelete from "./MessageBulkDelete";
import { MessageReportStatus } from "@utils/reports";
import { RequestStatus } from "@utils/requests";

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
            message = Messages.serialize(deletedMessage);
        }

        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guild_id);
        if (!config) return;

        const isModerationRequestChannel = config.data.moderation_requests
            .some(requestConfig => requestConfig.channel_id === message.channel_id);

        // Update the moderation request status to deleted
        if (isModerationRequestChannel) {
            await prisma.moderationRequest.update({
                where: { id: message.id },
                data: { status: RequestStatus.Deleted }
            }).catch(() => null);
        }

        this.handleMessageDeleteLog(message, config).catch(() => null);
    }

    // Fetch the user responsible for deleting the message
    static async getBlame(guild: Guild): Promise<User | null> {
        const auditLogEntry = await guild.fetchAuditLogs({
            type: AuditLogEvent.MessageDelete,
            limit: 1
        })
            .then(audit => audit.entries.first())
            .catch(() => null);

        if (!auditLogEntry) return null;

        const executorId = Messages.getBlame({
            executorId: auditLogEntry.executorId!,
            targetId: auditLogEntry.target.id,
            channelId: auditLogEntry.extra.channel.id,
            createdAt: auditLogEntry.createdAt,
            count: auditLogEntry.extra.count
        });

        if (!executorId) return null;

        return client.users
            .fetch(executorId)
            .catch(() => null);
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

    const messageUrl = messageLink(message.channel_id, message.id, config.guild.id);
    const executor = await MessageDelete.getBlame(channel.guild);

    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Message Deleted" })
        .setFields([
            {
                name: "Author",
                value: userMentionWithId(message.author_id)
            },
            {
                name: "Channel",
                value: channelMentionWithName(channel)
            },
            {
                name: "Message Content",
                value: await formatMessageContentForShortLog(message.content, message.sticker_id, messageUrl)
            }
        ])
        .setTimestamp(message.created_at);

    await updateMessageReportState(message.id, config, executor?.id);

    if (executor) {
        embed.setFooter({
            text: `Deleted by @${executor.username} - ${executor.id}`,
            iconURL: executor.displayAvatarURL()
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

async function updateMessageReportState(messageId: Snowflake, config: GuildConfig, executorId?: Snowflake): Promise<void> {
    if (!config.data.message_reports) return;

    const messageReport = await prisma.messageReport.update({
        where: {
            message_id: messageId,
            status: MessageReportStatus.Unresolved
        },
        data: {
            message_deleted: true
        }
    }).catch(() => null);

    if (!messageReport || !executorId) return;

    const alertChannel = await config.guild.channels
        .fetch(config.data.message_reports.report_channel)
        .catch(() => null);

    if (!alertChannel || !alertChannel.isTextBased()) return;

    const alert = await alertChannel.messages
        .fetch(messageReport.id)
        .catch(() => null);

    if (!alert) return;

    const newContent = `${alert.content}\n\nThis report is being handled by ${userMentionWithId(executorId)}`;
    const [rawEmbed] = alert.embeds;
    const embed = new EmbedBuilder(rawEmbed.toJSON()).setColor(Colors.Orange);

    alert.edit({
        content: newContent,
        embeds: [embed]
    });
}