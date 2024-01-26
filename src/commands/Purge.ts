import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    Message as DiscordMessage,
    GuildTextBasedChannel
} from "discord.js";

import { MessageCache, prepareMessageForStorage } from "../utils/messages.ts";
import { handleMessageBulkDeleteLog } from "../events/MessageBulkDelete.ts";
import { handleShortMessageDeleteLog } from "../events/MessageDelete.ts";
import { InteractionReplyData } from "../utils/types.ts";
import { ConfigManager } from "../utils/config.ts";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { pluralize } from "../utils";

import Command from "../handlers/commands/Command.ts";

export default class Purge extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "purge",
            description: "Purge messages in a channel",
            options: [
                {
                    name: PurgeSubcommand.User,
                    description: "Purge messages from a user",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "user",
                            description: "The user to purge",
                            type: ApplicationCommandOptionType.User,
                            required: true
                        },
                        {
                            name: "amount",
                            description: "The amount of messages to purge",
                            type: ApplicationCommandOptionType.Integer,
                            minValue: 1,
                            maxValue: 100
                        }
                    ]
                },
                {
                    name: PurgeSubcommand.All,
                    description: "Purge all messages in the channel",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [{
                        name: "amount",
                        description: "The amount of messages to purge",
                        type: ApplicationCommandOptionType.Integer,
                        required: true,
                        minValue: 1,
                        maxValue: 100
                    }]
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const subcommand = interaction.options.getSubcommand() as PurgeSubcommand;
        const amount = interaction.options.getInteger("amount") ?? 100;

        if (!interaction.channel) {
            return Promise.resolve("Failed to get the channel.");
        }

        let messages: Message[];
        let response: string;

        switch (subcommand) {
            case PurgeSubcommand.User: {
                const targetMember = interaction.options.getMember("user");

                if (targetMember && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                    return Promise.resolve("You cannot purge messages from a user with a higher role than you.");
                }

                const target = targetMember ?? interaction.options.getUser("user", true);

                messages = await purgeUser(target.id, interaction.channel, amount);
                response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${target}`;

                break;
            }

            case PurgeSubcommand.All: {
                messages = await this.purgeAll(interaction.channel, amount);
                response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")}`;

                break;
            }
        }

        if (!messages.length) {
            return Promise.resolve("No messages were purged.");
        }

        let logs: DiscordMessage<true>[];

        if (messages.length === 1) {
            logs = await handleShortMessageDeleteLog(messages[0], interaction.channel, config) ?? [];
        } else {
            logs = await handleMessageBulkDeleteLog(messages, interaction.channel, config) ?? [];
        }

        const logURLs = logs.map(log => log.url);

        return `${response}: ${logURLs.join(" ")}`;
    }

    async purgeAll(channel: GuildTextBasedChannel, amount: number): Promise<Message[]> {
        const messages = await channel.messages.fetch({ limit: amount });
        const serializedMessages = messages.map(message => prepareMessageForStorage(message));

        if (!messages.size) return [];

        MessageCache.purgeQueue.push({
            channelId: channel.id,
            messages: serializedMessages
        });

        // Bulk deletion must occur after the messages are cached
        await channel.bulkDelete(messages);
        return serializedMessages;
    }
}

async function purgeUser(targetId: Snowflake, channel: GuildTextBasedChannel, amount: number): Promise<Message[]> {
    const messages = await MessageCache.getByUser(targetId, channel.id, amount);
    const messageIds = messages.map(message => message.id);

    if (!messages.length) return [];

    MessageCache.purgeQueue.push({
        channelId: channel.id,
        messages: messages
    });

    // Bulk deletion must occur after the messages are cached
    await channel.bulkDelete(messageIds);
    return messages;
}

enum PurgeSubcommand {
    All = "all",
    User = "user"
}