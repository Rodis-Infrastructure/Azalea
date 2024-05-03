import {
    ActionRowBuilder,
    ButtonBuilder, Colors,
    EmbedBuilder,
    Events,
    GuildEmoji,
    hyperlink,
    inlineCode,
    Message,
    MessageCreateOptions,
    MessageReaction,
    PartialMessageReaction,
    ReactionEmoji,
    roleMention,
    User,
    userMention
} from "discord.js";

import {
    formatMessageContentForLog, formatMessageLogEntry,
    prepareMessageForStorage,
    prependReferenceLog,
    resolvePartialMessage
} from "@utils/messages";

import { handleQuickMute } from "@/commands/QuickMute30Ctx";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { cropLines, pluralize, userMentionWithId } from "@/utils";
import { Snowflake, ButtonStyle } from "discord-api-types/v10";
import { approveModerationRequest, denyModerationRequest } from "@utils/requests";
import { prisma } from "./..";
import { MessageReportFlag, MessageReportStatus } from "@utils/reports";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import Purge from "@/commands/Purge";
import { MuteDuration } from "@utils/infractions";

export default class MessageReactionAdd extends EventListener {
    constructor() {
        super(Events.MessageReactionAdd);
    }

    async execute(addedReaction: MessageReaction | PartialMessageReaction, user: User): Promise<void> {
        const reaction = addedReaction.partial
            ? await addedReaction.fetch()
            : addedReaction;

        const message = await resolvePartialMessage(reaction.message);
        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        // Only log the first reaction
        if (reaction.count === 1) {
            MessageReactionAdd._log(reaction.emoji, message, user, config);
        }

        const emojiId = MessageReactionAdd._getEmojiId(reaction.emoji);
        const executor = await message.guild.members.fetch(user.id);

        // All subsequent actions require the emoji configuration
        if (!config.data.emojis || !emojiId) return;

        // Handle a 30-minute quick mute
        if (emojiId === config.data.emojis.quick_mute_30) {
            await MessageReactionAdd._quickMute({
                duration: MuteDuration.Short,
                targetMessage: message,
                executor
            }, config);

            return;
        }

        // Handle a one-hour quick mute
        if (emojiId === config.data.emojis.quick_mute_60) {
            await MessageReactionAdd._quickMute({
                targetMessage: message,
                duration: MuteDuration.Long,
                executor
            }, config);

            return;
        }

        // Handle message purging
        if (emojiId === config.data.emojis.purge_messages) {
            await MessageReactionAdd._purgeUser(message, user.id, config);
            return;
        }

        // Handle moderation request approvals
        if (emojiId === config.data.emojis.approve) {
            await approveModerationRequest(message.id, user.id, config);
            return;
        }

        // Handle moderation request denials
        if (emojiId === config.data.emojis.deny) {
            await denyModerationRequest(message, user.id, config);
        }

        // Handle message reports
        if (emojiId === config.data.emojis.report_message && !message.author.bot) {
            await MessageReactionAdd.createMessageReport(user.id, message, config);
        }
    }

    static async createMessageReport(reporterId: Snowflake, message: Message<true>, config: GuildConfig): Promise<void> {
        // Message reports have not been configured
        if (!config.data.message_reports) return;

        const excludedRoles = config.data.message_reports.excluded_roles;
        const isExcluded = message.member?.roles.cache.some(role => excludedRoles.includes(role.id));

        // Don't report messages from users with excluded roles
        if (isExcluded) return;

        const alertChannel = await config.guild.channels.fetch(config.data.message_reports.report_channel);

        // Ensure the alert channel exists and is a text channel
        // An error should be thrown since the bot shouldn't be started with an incomplete configuration
        if (!alertChannel || !alertChannel.isTextBased()) {
            throw new Error(`Invalid alert channel passed to \`message_reports.alert_channel\` in the config for guild with ID ${config.guild.id}`);
        }

        const originalReport = await prisma.messageReport.findUnique({
            where: {
                message_id: message.id,
                status: MessageReportStatus.Unresolved
            }
        });

        // The message has already been reported
        if (originalReport) {
            return;
        }

        // Flags mapped by their names for the report
        const mappedFlags = [];
        const croppedContent = cropLines(message.content, 5);
        // Bitwise flags for storage
        let flags = 0;

        // Add a flag if the message has attachments
        if (message.attachments.size) {
            // Use Enum[Enum.Value] to ensure the flag name is up-to-date with changes
            mappedFlags.push(MessageReportFlag[MessageReportFlag.HasAttachment]);
            flags |= MessageReportFlag.HasAttachment;
        }

        // Add a flag if the message has stickers
        if (message.stickers.size) {
            // Use Enum[Enum.Value] to ensure the flag name is up-to-date with changes
            mappedFlags.push(MessageReportFlag[MessageReportFlag.HasSticker]);
            flags |= MessageReportFlag.HasSticker;
        }

        const alert = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setThumbnail(message.author.displayAvatarURL())
            .setFields([
                {
                    name: "Reported by",
                    value: userMentionWithId(reporterId)
                },
                {
                    name: "Target",
                    value: userMentionWithId(message.author.id)
                },
                {
                    name: "Message Content",
                    value: formatMessageContentForLog(croppedContent, message.url)
                }
            ])
            .setTimestamp();

        const reference = message.reference && await message.fetchReference()
            .catch(() => null);

        if (reference) {
            const croppedReference = cropLines(reference.content, 5);

            // Insert the reference content before the actual message content
            alert.spliceFields(2, 0, {
                name: `Reference from @${reference.author.username} (${reference.author.id})`,
                value: formatMessageContentForLog(croppedReference, reference.url)
            });
        }

        // Add flags to the embed if there are any
        if (mappedFlags.length) {
            // Split the flags by capital letters and wrap them in inline code blocks
            const formattedFlags = mappedFlags
                .map(flag => {
                    const formattedFlag = flag.split(/(?=[A-Z])/).join(" ");
                    return inlineCode(formattedFlag);
                })
                .join(", ");

            alert.addFields({
                name: "Flags",
                value: formattedFlags
            });
        }

        // Mark the report as resolved
        const resolveMessageReportButton = new ButtonBuilder()
            .setCustomId(`message-report-resolve`)
            .setLabel("OK")
            .setStyle(ButtonStyle.Success);

        // Mute the target user for 30 minutes
        const quickMute30Button = new ButtonBuilder()
            .setCustomId("message-report-qm30")
            .setLabel("QM (30m)")
            .setStyle(ButtonStyle.Danger);

        // Mute the target user for 1 hour
        const quickMute60Button = new ButtonBuilder()
            .setCustomId("message-report-qm60")
            .setLabel("QM (1h)")
            .setStyle(ButtonStyle.Danger);

        const userInfoButton = new ButtonBuilder()
            .setCustomId(`user-info-${message.author.id}`)
            .setLabel("User Info")
            .setStyle(ButtonStyle.Secondary);

        // Search the target user's infractions
        const infractionsButton = new ButtonBuilder()
            .setCustomId(`infraction-search-${message.author.id}`)
            .setLabel("Infractions")
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>().setComponents(
            resolveMessageReportButton,
            quickMute30Button,
            quickMute60Button,
            userInfoButton,
            infractionsButton
        );

        // Mention the roles that should be pinged when a message is reported
        const mentionedRoles = config.data.message_reports.mentioned_roles
            ?.map(roleMention)
            .join(" ");

        const report = await alertChannel.send({
            content: mentionedRoles,
            embeds: [alert],
            components: [actionRow]
        });

        // Store the report
        await prisma.messageReport.upsert({
            where: {
                message_id: message.id
            },
            create: {
                id: report.id,
                message_id: message.id,
                author_id: message.author.id,
                channel_id: message.channelId,
                content: message.content,
                reported_by: message.author.id,
                flags
            },
            update: {
                status: MessageReportStatus.Unresolved,
                created_at: new Date(),
                resolved_by: null,
                id: report.id
            }
        });

        alert.setTitle("New Message Report");

        log({
            event: LoggingEvent.MessageReportCreate,
            channel: message.channel,
            message: { embeds: [alert] },
            config
        });
    }

    private static async _purgeUser(message: Message<true>, executorId: Snowflake, config: GuildConfig): Promise<void> {
        const messages = await Purge.purgeUser(
            message.author.id,
            message.channel,
            config.data.default_purge_amount
        );

        const response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${message.author}`;
        const logUrls = await Purge.log(messages, message.channel, config);

        config.sendNotification(`${userMention(executorId)} ${response}: ${logUrls.join(" ")}`);
    }

    private static async _quickMute(data: Parameters<typeof handleQuickMute>[number], config: GuildConfig): Promise<void> {
        const response = await handleQuickMute(data);
        config.sendNotification(`${data.executor} ${response}`);
    }

    private static async _log(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User,
        config: GuildConfig
    ): Promise<void> {
        let logContent: MessageCreateOptions | null;

        if (message.content.length > EMBED_FIELD_CHAR_LIMIT) {
            logContent = await MessageReactionAdd._getLongLogContent(emoji, message, user);
        } else {
            logContent = await MessageReactionAdd._getShortLogContent(emoji, message, user);
        }

        if (!logContent) return;

        log({
            event: LoggingEvent.MessageReactionAdd,
            channel: message.channel,
            message: logContent,
            config
        });
    }

    private static async _getShortLogContent(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User
    ): Promise<MessageCreateOptions | null> {
        const embed = new EmbedBuilder()
            .setColor(0x9C84EF) // Light purple
            .setAuthor({ name: "Reaction Added" })
            .setFields([
                {
                    name: "Reaction Author",
                    value: `${user} (\`${user.id}\`)`
                },
                {
                    name: "Channel",
                    value: `${message.channel} (\`#${message.channel.name}\`)`
                },
                {
                    name: "Emoji",
                    value: MessageReactionAdd._parseEmoji(emoji)
                }
            ])
            .setTimestamp();

        const embeds = [embed];
        await prependReferenceLog(message.id, embeds);

        return { embeds };
    }

    private static async _getLongLogContent(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User
    ): Promise<MessageCreateOptions | null> {
        const serializedMessage = prepareMessageForStorage(message);
        const entry = await formatMessageLogEntry(serializedMessage);
        const file = mapLogEntriesToFile([entry]);

        return {
            content: `Reaction ${MessageReactionAdd._parseEmoji(emoji)} added to message in ${message.channel} by ${user}`,
            allowedMentions: { parse: [] },
            files: [file]
        };
    }

    /** @returns The emoji ID and URL if the emoji is a custom emoji, otherwise the emoji name */
    private static _parseEmoji(emoji: GuildEmoji | ReactionEmoji): string {
        if (emoji.id) {
            const maskedEmojiURL = hyperlink("view", `<${emoji.imageURL()}>`);
            return `\`<:${emoji.name}:${emoji.id}>\` (${maskedEmojiURL})`;
        }

        return emoji.toString();
    }

    private static _getEmojiId(emoji: GuildEmoji | ReactionEmoji): string | null {
        return emoji.id ?? emoji.name;
    }
}