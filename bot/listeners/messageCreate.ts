import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    EmbedBuilder,
    Events,
    hideLinkEmbed,
    Message,
    PartialMessage
} from "discord.js";

import { getRequestType, handleBanRequestAutoMute, handleRoleRequest, validateRequest } from "@bot/utils/requests";
import { BotChannel, LoggingEvent, RolePermission } from "@bot/types/config";
import { Requests } from "@bot/types/requests";
import { ensureError, serializeMessage } from "@bot/utils";
import { ErrorCause } from "@bot/types/internals";
import { sendLog } from "@bot/utils/logging";
import { getQuery, runQuery } from "@database/utils";
import { Ticket } from "@database/models/ticket";

import EventListener from "@bot/handlers/listeners/eventListener";
import Config from "@bot/utils/config";
import Cache from "@bot/utils/cache";

export default class MessageCreateEventListener extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(createdMessage: Message | PartialMessage): Promise<void> {
        const message = createdMessage.partial
            ? await createdMessage.fetch().catch(() => null)
            : createdMessage;

        if (!message || message.author.bot) return;

        if (!message.inGuild()) {
            await handleTicketResponse(message);
            return;
        }

        // Cache the message
        const cache = Cache.get(message.guildId);
        cache.messages.store.set(message.id, serializeMessage(message));

        const config = Config.get(message.guildId);
        if (!config) return;

        // Remove messages from media channel if it doesn't have an attachment or a link
        if (config.mediaChannels.includes(message.channelId) && !message.attachments.size && !message.content.includes("http")) {
            await handleMediaChannelMessage(message, config);
        }

        const reactions = config.getAutoReactions(message.channelId);

        // There are reactions configured to be added automatically
        if (reactions.length) {
            const reactionsAddPromise = reactions.map(r => message.react(r).catch(() => null));
            await Promise.all(reactionsAddPromise);
        }

        if (message.channelId === config.roleRequests?.channelId && message.mentions.users.size) await handleRoleRequest(message, config);
        if (message.channelId === config.channels.mediaConversion && message.attachments.size) await handleMediaConversion(message);

        const requestType = getRequestType(message.channelId, config);

        // Handle mute/ban requests
        if (requestType && message.member) {
            try {
                const isAutoMuteEnabled = requestType === Requests.Ban
                    && config.hasPermission(message.member, RolePermission.AutoMuteBanRequests);

                const { target, reason } = await validateRequest({
                    request: message,
                    requestType,
                    config
                });

                if (target && isAutoMuteEnabled) {
                    await handleBanRequestAutoMute({
                        request: message,
                        target,
                        reason,
                        config
                    });
                }
            } catch (_error) {
                const error = ensureError(_error);
                const emoji = error.cause === ErrorCause.DuplicateRequest ? "🔄" : "⚠️";

                const [response] = await Promise.all([
                    message.reply({
                        content: error.message,
                        allowedMentions: { parse: [], repliedUser: true }
                    }),
                    message.react(emoji)
                ]);

                // Remove after 5 seconds
                setTimeout(async() => {
                    await response.delete().catch(() => null);
                }, 5000);
            }
        }
    }
}

async function handleMediaConversion(message: Message<true>): Promise<void> {
    const log = await sendLog({
        event: LoggingEvent.Media,
        guildId: message.guildId,
        options: {
            content: `Media stored by ${message.author}`,
            files: Array.from(message.attachments.values()),
            allowedMentions: { parse: [] }
        }
    });

    if (!log) {
        await message.reply("Failed to store media, please contact the bot owner(s) if this keeps happening.");
        return;
    }

    await Promise.all([
        message.delete().catch(() => null),
        message.channel.send(`${message.author} Your media log: ${log.url} (${hideLinkEmbed(log.url)})`)
    ]);
}

export async function handleMediaChannelMessage(message: Message, config: Config): Promise<void> {
    // Do not remove staff messages
    if (message.member && config.isGuildStaff(message.member)) return;

    const [reply] = await Promise.all([
        message.channel.send(`${message.author} This is a media-only channel, your message must have at least one attachment.`).catch(() => null),
        message.delete().catch(() => null)
    ]);

    if (!reply) return;

    // Remove after 3 seconds
    setTimeout(async() => {
        await reply.delete().catch(() => null);
    }, 3000);
}

async function handleTicketResponse(message: Message): Promise<void> {
    const openTicket = await getQuery<Pick<Ticket, "last_message_id" | "guild_id">>(`
        SELECT last_message_id, guild_id
        FROM tickets
        WHERE target_id = ${message.author.id}
    `);

    if (!openTicket) return;

    const config = Config.get(openTicket.guild_id);
    if (!config) return;

    const ticketChannel = await config.fetchChannel(BotChannel.Tickets);
    if (!ticketChannel) return;

    const ticketMessage = await ticketChannel.messages.fetch(openTicket.last_message_id).catch(() => null);
    if (!ticketMessage) return;

    if (ticketMessage.components.length) {
        await ticketMessage.edit({ components: [] });
    }

    const response = new EmbedBuilder()
        .setColor(Colors.NotQuiteBlack)
        .setAuthor({ name: `Response from ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content)
        .setFooter({ text: `ID: ${message.author.id}` })
        .setTimestamp();

    const endConversationBtn = new ButtonBuilder()
        .setCustomId(`ticket-close-${message.author.id}`)
        .setLabel("End Conversation")
        .setStyle(ButtonStyle.Danger);

    const respondBtn = new ButtonBuilder()
        .setCustomId(`ticket-respond-${message.author.id}`)
        .setLabel("Respond")
        .setStyle(ButtonStyle.Primary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .setComponents(endConversationBtn, respondBtn);

    const responseMessage = await ticketMessage.reply({
        embeds: [response],
        components: [actionRow]
    });

    await runQuery(`
        UPDATE tickets
        SET last_message_id = ${responseMessage.id}
        WHERE target_id = ${message.author.id}
    `);
}