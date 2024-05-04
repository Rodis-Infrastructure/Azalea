import {
    ActionRowBuilder,
    ButtonBuilder, ButtonStyle,
    EmbedBuilder,
    Events,
    Message,
    PartialMessage, SelectMenuComponentOptionData,
    StringSelectMenuBuilder
} from "discord.js";

import { Messages, resolvePartialMessage, temporaryReply } from "@utils/messages";
import { handleModerationRequest } from "@utils/requests";
import { MediaStoreError } from "@utils/errors";
import { pluralize, userMentionWithId } from "@/utils";

import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import Sentry from "@sentry/node";
import StoreMediaCtx from "@/commands/StoreMediaCtx";
import GuildConfig from "@managers/config/GuildConfig";
import { RoleRequestNoteAction } from "@/components/RoleRequestNote";

export default class MessageCreate extends EventListener {
    constructor() {
        super(Events.MessageCreate);
    }

    async execute(newMessage: PartialMessage | Message): Promise<void> {
        const message = await resolvePartialMessage(newMessage);
        if (!message || message.author.bot) return;

        Messages.set(message);

        const config = ConfigManager.getGuildConfig(message.guild.id);
        if (!config) return;

        // Handle media conversion
        if (
            message.channel.id === config.data.media_conversion_channel &&
            message.attachments.size &&
            !message.content
        ) {
            try {
                const media = Array.from(message.attachments.values());
                const logUrls = await StoreMediaCtx.storeMedia(message.author.id, message.author.id, media, config);

                await message.reply(`Stored \`${media.length}\` ${pluralize(media.length, "attachment")} - ${logUrls.join(" ")}`);
                message.delete().catch(() => null);
            } catch (error) {
                if (error instanceof MediaStoreError) {
                    temporaryReply(message, error.message, config.data.response_ttl);
                } else {
                    Sentry.captureException(error);
                    temporaryReply(message, "An error occurred while converting media..", config.data.response_ttl);
                }
            }
        }

        const autoReactionEmojis = config.getAutoReactionEmojis(message.channel.id);

        // Add auto reactions to the message
        for (const emoji of autoReactionEmojis) {
            message.react(emoji).catch(() => null);
        }

        const hasAttachments = message.attachments.size > 0;
        const mediaChannel = config.data.media_channels
            .find(mediaChannel => mediaChannel.channel_id === message.channel.id);

        // Remove message if it doesn't have an attachment in a media channel
        if (mediaChannel && !hasAttachments) {
            const canPostInMediaChannel = !mediaChannel.allowed_roles || mediaChannel.allowed_roles
                .some(roleId => message.member?.roles.cache.has(roleId));

            if (!canPostInMediaChannel) {
                const response = mediaChannel.fallback_response ?? "This is a media-only channel, please include an attachment in your message.";
                await temporaryReply(message, response, config.data.response_ttl);
                message.delete().catch(() => null);
            }
        }

        if (config.data.role_requests?.channel_id === message.channel.id && message.mentions.users.size) {
            MessageCreate._createRoleRequest(message, config);
        }

        // Source channel conditions are handled within the function
        handleModerationRequest(message, config);
    }

    private static async _createRoleRequest(message: Message<true>, config: GuildConfig): Promise<void> {
        if (message.mentions.users.size > 50) {
            await temporaryReply(message, "You can only mention up to 50 users at a time.", config.data.response_ttl);
            return;
        }

        const mentionedUsers = message.mentions.users.map(user => userMentionWithId(user.id));
        const embed = new EmbedBuilder()
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