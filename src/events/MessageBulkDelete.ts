import {
    ActionRowBuilder,
    ButtonBuilder, ButtonStyle,
    Collection,
    Events,
    GuildTextBasedChannel,
    Message as DiscordMessage,
    PartialMessage,
    userMention
} from "discord.js";

import { log, mapLogEntriesToFile } from "@utils/logging";
import { formatMessageLogEntry, Messages } from "@utils/messages";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { getFilePreviewUrl, pluralize } from "@/utils";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";

export default class MessageBulkDelete extends EventListener {
    constructor() {
        super(Events.MessageBulkDelete);
    }

    async execute(deletedMessages: Collection<Snowflake, PartialMessage | DiscordMessage<true>>, channel: GuildTextBasedChannel): Promise<void> {
        const messages = await Messages.deleteMany(deletedMessages);
        const config = ConfigManager.getGuildConfig(channel.guild.id);

        if (!messages.length || !config) return;

        const purgeIndex = Messages.purgeQueue.findIndex(purged =>
            purged.messages.some(message =>
                messages.some(m => m.id === message.id)
            )
        );

        // Logging is handled by the purge command
        if (purgeIndex !== -1) {
            return;
        } else {
            delete Messages.purgeQueue[purgeIndex];
        }

        MessageBulkDelete.log(messages, channel, config);
    }

    static async log(
        messages: Message[],
        channel: GuildTextBasedChannel,
        config: GuildConfig
    ): Promise<DiscordMessage<true>[] | null> {
        const authorMentions: ReturnType<typeof userMention>[] = [];
        const entries: string[] = [];

        // Format message log entries
        for (const message of messages) {
            const authorMention = userMention(message.author_id);
            const messageEntry = await formatMessageLogEntry(message);
            const subEntries = [messageEntry];

            if (!authorMentions.includes(authorMention)) {
                authorMentions.push(authorMention);
            }

            if (message.reference_id) {
                const reference = await Messages.get(message.reference_id);

                if (reference) {
                    const referenceEntry = await formatMessageLogEntry(reference);
                    subEntries.unshift(`REF: ${referenceEntry}`);
                }
            }

            entries.push(subEntries.join("\n └── "));
        }

        // E.g. Deleted `5` messages in #general by @user1, @user2
        const logContent = `Deleted \`${messages.length}\` ${pluralize(messages.length, "message")} in ${channel} by ${authorMentions.join(", ")}`;
        const file = mapLogEntriesToFile(entries);

        const logs = await log({
            event: LoggingEvent.MessageBulkDelete,
            message: {
                allowedMentions: { parse: [] },
                content: logContent,
                files: [file]
            },
            channel,
            config
        });

        if (logs) {
            for (const message of logs) {
                const fileUrl = message.attachments.first()!.url;
                const previewUrl = getFilePreviewUrl(fileUrl);

                const refreshFileLink = new ButtonBuilder()
                    .setLabel("Refresh Link")
                    .setStyle(ButtonStyle.Secondary)
                    .setCustomId("message-delete-bulk-refresh-url");

                const openInBrowserUrl = new ButtonBuilder()
                    .setLabel("Open in Browser")
                    .setStyle(ButtonStyle.Link)
                    .setURL(previewUrl);

                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .setComponents(refreshFileLink, openInBrowserUrl);

                await message.edit({ components: [actionRow] });
            }
        }

        return logs;
    }
}