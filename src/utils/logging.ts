import {
    AttachmentPayload,
    ChannelType,
    codeBlock,
    Colors,
    EmbedBuilder,
    GuildTextBasedChannel,
    hyperlink,
    Message,
    userMention
} from "discord.js";

import { elipsify, pluralize } from "./index";
import { MessageModel } from "../types/db";
import { LogData } from "../types/utils";

import ClientManager from "../client";

export async function sendLog(data: LogData): Promise<Message<true> | void> {
    const { event, channel, guildId, options } = data;
    const config = ClientManager.config(channel?.guildId || guildId!);

    const loggingChannelId = config?.loggingChannel(event);
    if (!loggingChannelId) throw `Channel ID for event ${event} not configured.`;

    const loggingChannel = await ClientManager.client.channels.fetch(loggingChannelId) as GuildTextBasedChannel;
    if (!loggingChannel) throw `Logging channel for event ${event} not found.`;

    if (channel) {
        let channelId = channel.id;
        let categoryId = channel.parentId;

        const isThread = channel.type === ChannelType.PublicThread
            || channel.type === ChannelType.PrivateThread
            || channel.type === ChannelType.AnnouncementThread;

        if (isThread) {
            const parent = channel.parent;
            if (!parent) throw `Thread ${channelId} has no parent.`;

            channelId = parent.id;
            categoryId = parent.parentId;
        }

        if (!config?.loggingAllowed(event, channelId, categoryId || undefined)) return;
    }

    return loggingChannel.send(options);
}

export async function linkToPurgeLog(data: {
    guildId: string,
    content: string | MessageModel[],
    url: string | void
}) {
    const { url, content, guildId } = data;
    const cache = ClientManager.cache.messages.purged;

    if (!cache) return;
    if (typeof content === "string" && !cache.data.includes(content)) return;
    if (typeof content !== "string" && !content.some(({ message_id }) => cache.data.includes(message_id))) return;

    const config = ClientManager.config(guildId)!;

    if (!url) {
        await config.sendConfirmation({
            message: `${config.emojis.error} ${userMention(cache.moderatorId)} failed to retrieve the log's URL`,
            full: true
        });

        ClientManager.cache.messages.purged = undefined;
        return;
    }

    const amount = typeof content === "string" ? 1 : content.length;
    const author = cache.targetId
        ? ` by <@${cache.targetId}> (\`${cache.targetId}\`)`
        : "";

    await config.sendConfirmation({
        message: `purged \`${amount}\` ${pluralize("message", amount)}${author}: ${url}`,
        authorId: cache.moderatorId,
        allowMentions: true
    });

    ClientManager.cache.messages.purged = undefined;
}

export function formatLogContent(content: string | null): string {
    if (!content) return "No message content.";

    let formatted = content.replaceAll("```", "\\`\\`\\`");
    formatted = elipsify(formatted, 1000);

    return codeBlock(formatted);
}

export function createReferenceLog(reference: MessageModel, options: {
    referenceDeleted: boolean
}): {
        embed: EmbedBuilder,
        file: AttachmentPayload
    } {
    const referenceURL = `https://discord.com/channels/${reference.guild_id}/${reference.channel_id}/${reference.message_id}`;
    const referenceLog = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({
            name: "Reference",
            iconURL: "attachment://reply.png"
        })
        .setFields([
            {
                name: "Author",
                value: userMention(reference.author_id)
            },
            {
                name: "Content",
                value: formatLogContent(reference.content)
            }
        ]);

    if (!options.referenceDeleted) referenceLog.setDescription(hyperlink("Jump to message", referenceURL));

    return {
        embed: referenceLog,
        file: { attachment: "./icons/reply.png", name: "reply.png" }
    };
}