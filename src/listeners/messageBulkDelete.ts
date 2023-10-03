import {
    AttachmentBuilder,
    Collection,
    Events,
    GuildTextBasedChannel,
    hyperlink,
    Message,
    Snowflake
} from "discord.js";

import { processBulkDeletedMessages } from "../utils/cache";
import { serializeMessageToDatabaseModel } from "../utils";
import { linkToPurgeLog, sendLog } from "../utils/logging";
import { LoggingEvent } from "../types/config";
import { MessageModel } from "../types/db";

import EventListener from "../handlers/listeners/eventListener";

export default class MessageBulkDeleteEventListener extends EventListener {
    constructor() {
        super(Events.MessageBulkDelete);
    }

    async execute(deletedMessages: Collection<string, Message<true>>, channel: GuildTextBasedChannel): Promise<void> {
        if (!channel.guildId) return;

        const content: string[] = [];
        const partialMessageIds: string[] = [];
        const messages: MessageModel[] = [];
        const authorIds = new Set<Snowflake>();

        for (const message of deletedMessages.values()) {
            if (message.partial) {
                partialMessageIds.push(message.id);
            } else {
                content.push(`[${message.createdAt.toLocaleString("en-GB")}] ${message.author.id} — ${message.content}`);
                messages.push(serializeMessageToDatabaseModel(message, true));
                authorIds.add(message.author.id);
            }
        }

        for (const message of await processBulkDeletedMessages(partialMessageIds)) {
            const msCreatedAt = message.created_at * 1000;

            content.push(`[${msCreatedAt.toLocaleString("en-GB")}] ${message.author_id} — ${message.content}`);
            messages.push(message);
            authorIds.add(message.author_id);
        }

        if (!content.length) return;

        const file = new AttachmentBuilder(Buffer.from(content.join("\n\n")))
            .setName(`messages.txt`)
            .setDescription("Purged messages");

        const authors = authorIds.size
            ? ` by <@${Array.from(authorIds).join(">, <@")}>`
            : "";

        const log = await sendLog({
            event: LoggingEvent.Message,
            channelId: channel.id,
            categoryId: channel.parentId,
            guildId: channel.guildId,
            options: {
                content: `Purged \`${content.length}\` messages${authors} in ${channel} (\`#${channel.name}\`)`,
                allowedMentions: { parse: [] },
                files: [file]
            }
        });

        if (!log) return;

        const attachmentId = log.attachments.first()!.id;
        const jumpURL = hyperlink("Open in browser", `https://txt.discord.website?txt=${log.channelId}/${attachmentId}/messages&raw=true`);

        await Promise.all([
            log.edit(`${log.content}\n\n${jumpURL}`),
            linkToPurgeLog({
                guildId: channel.guildId,
                content: messages,
                url: log.url
            })
        ]);
    }
}