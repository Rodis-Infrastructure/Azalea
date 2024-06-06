import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    Message as DiscordMessage,
    GuildTextBasedChannel,
    FetchMessagesOptions,
    SnowflakeUtil,
    time,
    TimestampStyles,
    ChannelType, PermissionFlagsBits
} from "discord.js";

import { Messages } from "@utils/messages";
import { handleShortMessageDeleteLog } from "@/events/MessageDelete";
import { InteractionReplyData } from "@utils/types";
import { Snowflake } from "discord-api-types/v10";
import { Message } from "@prisma/client";
import { pluralize } from "@/utils";
import { DURATION_FORMAT, EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import GuildConfig from "@managers/config/GuildConfig";
import Command from "@managers/commands/Command";
import MessageBulkDelete from "@/events/MessageBulkDelete";
import ms from "ms";

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
                        },
                        {
                            name: "channel",
                            description: "The channel to purge the messages in (current channel by default)",
                            type: ApplicationCommandOptionType.Channel,
                            channel_types: [ChannelType.GuildText]
                        },
                        {
                            name: "period",
                            description: "The period of time over which to remove the messages",
                            type: ApplicationCommandOptionType.String
                        }
                    ]
                },
                {
                    name: PurgeSubcommand.All,
                    description: "Purge all messages in the channel",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "amount",
                            description: "The amount of messages to purge",
                            type: ApplicationCommandOptionType.Integer,
                            required: true,
                            minValue: 1,
                            maxValue: 100
                        },
                        {
                            name: "channel",
                            description: "The channel to purge the messages in (current channel by default)",
                            type: ApplicationCommandOptionType.Channel,
                            channel_types: [ChannelType.GuildText]
                        },
                        {
                            name: "period",
                            description: "The period of time over which to remove the messages",
                            type: ApplicationCommandOptionType.String
                        }
                    ]
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const subcommand = interaction.options.getSubcommand(true) as PurgeSubcommand;
        const channel = interaction.options.getChannel<ChannelType.GuildText>("channel") ?? interaction.channel;
        const amount = interaction.options.getInteger("amount") ?? 100;
        const period = interaction.options.getString("period");
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        let msPeriod: number | undefined;

        if (period) {
            if (!DURATION_FORMAT.test(period)) {
                return `Invalid period format. Please use the following format: \`<number><unit>\` (e.g. \`1d\`, \`2h\`, \`15m\`)`;
            }

            DURATION_FORMAT.lastIndex = 0;

            // Ensure the period doesn't exceed the message TTL
            msPeriod = ms(period);
        }

        // Check if the bot can access the channel
        // This is necessary for purging messages
        if (!channel) {
            return Promise.resolve("Failed to get the channel.");
        }

        // Ensure the executor has permission to manage messages in the channel
        if (!channel.permissionsFor(interaction.member).has(PermissionFlagsBits.ManageMessages)) {
            return Promise.resolve(`You do not have permission to manage messages in ${channel}.`);
        }

        // The purged messages
        let messages: Message[];
        // The response to send
        let response: string;

        switch (subcommand) {
            // Purge messages from a user
            case PurgeSubcommand.User: {
                const targetMember = interaction.options.getMember("user");

                // Compare roles to ensure the executor has permission to ban the target
                if (targetMember && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                    return Promise.resolve("You cannot purge messages from a user with a higher role than you.");
                }

                const target = targetMember ?? interaction.options.getUser("user", true);

                // Purge the user's messages
                messages = await Purge.purgeUser(target.id, channel, amount, msPeriod);
                response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${target}`;

                break;
            }

            // Purge all recent messages in the channel
            case PurgeSubcommand.All: {
                // Purge the channel's recent messages
                messages = await Purge._purgeAll(channel, amount, msPeriod);
                response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")}`;

                break;
            }
        }

        if (msPeriod) {
            const date = new Date(Date.now() - msPeriod);
            response += ` created after ${time(date, TimestampStyles.LongDateTime)}`;
        }

        // If no messages were purged, don't respond with an amount
        if (!messages.length) {
            return Promise.resolve("No messages were purged.");
        }

        // Link to the log for ease of access
        const logURLs = await Purge.log(messages, channel, config);
        return `${response}: ${logURLs.join(" ")}`;
    }

    /**
     * Purges messages sent by anyone in a channel
     *
     * @param channel - The channel to purge messages from
     * @param amount - The maximum amount of messages to purge
     * @param period - The period over which to remove the messages (in milliseconds)
     * @returns The purged messages
     */
    private static async _purgeAll(channel: GuildTextBasedChannel, amount: number, period?: number): Promise<Message[]> {
        const options: FetchMessagesOptions = { limit: amount };

        if (period) {
            options.after = SnowflakeUtil.generate({
                timestamp: Date.now() - period
            }).toString();
        }

        // Fetch recently sent messages in the channel
        const messages = await channel.messages.fetch(options);
        // Serialize the messages for storage
        const serializedMessages = messages.map(message => Messages.serialize(message));

        if (!messages.size) return [];

        // Append the messages to the purge queue for logging
        Messages.purgeQueue.push({
            channelId: channel.id,
            messages: serializedMessages
        });

        // Purge the messages
        await channel.bulkDelete(messages);
        return serializedMessages;
    }

    /**
     * Handles logging for message purging
     *
     * @param messages - The messages that were purged
     * @param channel - The channel the messages were purged from
     * @param config - The guild's configuration
     * @returns The URLs to the logs
     */
    static async log(messages: Message[], channel: GuildTextBasedChannel, config: GuildConfig): Promise<string[]> {
        let logs: DiscordMessage<true>[];

        // If only one message was purged, log it as a single message
        // Otherwise, log them in a text file
        if (messages.length === 1 && (!messages[0].content || messages[0].content.length <= EMBED_FIELD_CHAR_LIMIT)) {
            logs = await handleShortMessageDeleteLog(messages[0], channel, config) ?? [];
        } else {
            logs = await MessageBulkDelete.log(messages, channel, config) ?? [];
        }

        // Link to the logs for ease of access
        return logs.map(log => log.url);
    }

    /**
     * Purges messages from a user in a channel
     *
     * @param targetId - The ID of the user to purge messages from
     * @param channel - The channel to purge messages from
     * @param period - The period over which to remove the messages (in milliseconds)
     * @param amount - The maximum amount of messages to purge
     * @returns The purged messages
     */
    static async purgeUser(targetId: Snowflake, channel: GuildTextBasedChannel, amount: number, period?: number): Promise<Message[]> {
        // Get the user's messages from cache or the database
        const messages = await Messages.deleteMessagesByUser(targetId, channel.id, amount, period);
        // Map the messages by their IDs
        const messageIds = messages.map(message => message.id);

        if (!messages.length) return [];

        // Append the messages to the purge queue for logging
        Messages.purgeQueue.push({
            channelId: channel.id,
            messages: messages
        });

        // Purge the messages
        await channel.bulkDelete(messageIds);
        return messages;
    }
}


enum PurgeSubcommand {
    All = "all",
    User = "user"
}