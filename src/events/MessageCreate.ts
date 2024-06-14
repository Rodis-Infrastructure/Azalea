import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Events,
    Message,
    PartialMessage,
    SelectMenuComponentOptionData,
    StringSelectMenuBuilder
} from "discord.js";

import { Messages, temporaryReply } from "@utils/messages";
import { pluralize, userMentionWithId } from "@/utils";
import { RoleRequestNoteAction } from "@/components/RoleRequestNote";
import { client } from "./..";
import { DEFAULT_EMBED_COLOR } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import StoreMediaCtx from "@/commands/StoreMediaCtx";
import GuildConfig from "@managers/config/GuildConfig";
import MuteRequestUtil from "@utils/muteRequests";
import BanRequestUtil from "@utils/banRequests";

export default class MessageCreate extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(newMessage: PartialMessage | Message<true>): Promise<void> {
        const message = await MessageCreate._parseMessage(newMessage);
        if (!message || message.author.id === client.user.id) return;

        const config = ConfigManager.getGuildConfig(message.guild.id);
        if (!config) return;

        // Handle new mute requests
        if (message.channelId === config.data.mute_requests?.channel_id) {
            await MuteRequestUtil.upsert(message, config);
        }

        // Handle new ban requests
        if (message.channelId === config.data.ban_requests?.channel_id) {
            await BanRequestUtil.upsert(message, config);
        }

        // Subsequent processes should not run if the message author is a bot
        if (message.author.bot) return;

        Messages.queue(message);
        MessageCreate._handleAutoReactions(message, config);
        await MessageCreate._handleMediaChannel(message, config);

        // Handle media conversion
        if (message.channel.id === config.data.media_conversion_channel) {
            await MessageCreate._handleMediaConversion(message, config);
        }

        // Handle role requests
        if (config.data.role_requests?.channel_id === message.channel.id && message.mentions.users.size) {
            MessageCreate._createRoleRequest(message, config);
        }
    }

    private static async _parseMessage(message: PartialMessage | Message<true>): Promise<Message<true> | null> {
        return message.partial
            ? await message.fetch().catch(() => null) as Message<true> | null
            : message;
    }

    private static async _handleMediaChannel(message: Message<true>, config: GuildConfig): Promise<void> {
        const mediaChannel = config.data.media_channels
            .find(mediaChannel => mediaChannel.channel_id === message.channel.id);

        if (!mediaChannel) return;

        const isExcluded = message.member?.roles.cache.some(role =>
            mediaChannel.exclude_roles.includes(role.id)
        );

        if (isExcluded) return;

        const hasAttachments = message.attachments.size > 0 || message.content.includes("://");
        const canPostInMediaChannel = !mediaChannel.allowed_roles || mediaChannel.allowed_roles
            .some(roleId => message.member?.roles.cache.has(roleId));

        if (!hasAttachments) {
            await temporaryReply(message, "This is a media-only channel, please include an attachment in your message.", config.data.response_ttl);
            message.delete().catch(() => null);
            return;
        }

        if (!canPostInMediaChannel) {
            const response = mediaChannel.fallback_response ?? "You do not have permission to post in this channel.";
            await temporaryReply(message, response, config.data.response_ttl);

            message.delete().catch(() => null);
        }
    }

    private static _handleAutoReactions(message: Message<true>, config: GuildConfig): void {
        if (!message.member) return;

        const autoReactionEmojis = config.getAutoReactionEmojis(message.channel.id, message.member.roles.cache);

        // Add auto reactions to the message
        for (const emoji of autoReactionEmojis) {
            message.react(emoji).catch(() => null);
        }
    }

    private static async _handleMediaConversion(message: Message<true>, config: GuildConfig): Promise<void> {
        if (!message.attachments.size || message.content) return;

        const media = Array.from(message.attachments.values());
        const result = await StoreMediaCtx.storeMedia(message.member, message.author.id, media, config);

        if (!result.success) {
            await temporaryReply(message, result.message, config.data.response_ttl);
            return;
        }

        await message.reply(`Stored \`${media.length}\` ${pluralize(media.length, "attachment")} - ${result.data.join(" ")}`);
        message.delete().catch(() => null);
    }

    private static async _createRoleRequest(message: Message<true>, config: GuildConfig): Promise<void> {
        if (message.mentions.users.size > 50) {
            await temporaryReply(message, "You can only mention up to 50 users at a time.", config.data.response_ttl);
            return;
        }

        const mentionedUsers = message.mentions.users.map(user => userMentionWithId(user.id));
        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setAuthor({
                name: `Role Request (by @${message.author.username} - ${message.author.id})`,
                url: message.author.displayAvatarURL(),
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(mentionedUsers.join("\n"));

        const selectableRoleIds = config.data.role_requests!.roles;
        const roles = await message.guild.roles.fetch();
        const selectableRoles = roles.filter(role =>
            selectableRoleIds.some(selectableRole => selectableRole.id === role.id)
        );

        const selectableRoleOptions: SelectMenuComponentOptionData[] = selectableRoles.map(role => ({
            label: role.name,
            value: role.id
        }));

        const roleSelectMenu = new StringSelectMenuBuilder()
            .setCustomId("role-request-select-role")
            .setPlaceholder("Select role to add...")
            .setOptions(selectableRoleOptions);

        const selectMenuActionRow = new ActionRowBuilder<StringSelectMenuBuilder>()
            .setComponents(roleSelectMenu);

        const addNoteButton = new ButtonBuilder()
            .setCustomId(`role-request-note-${RoleRequestNoteAction.Add}`)
            .setLabel("Add Note")
            .setStyle(ButtonStyle.Secondary);

        const buttonActionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(addNoteButton);

        await message.channel.send({
            embeds: [embed],
            components: [selectMenuActionRow, buttonActionRow]
        });

        message.delete().catch(() => null);
    }
}