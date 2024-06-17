import {
    ActionRowBuilder,
    ButtonBuilder,
    Colors,
    EmbedBuilder,
    Events,
    GuildEmoji,
    GuildMember,
    hyperlink,
    Message,
    MessageCreateOptions,
    MessageReaction,
    PartialMessage,
    PartialMessageReaction,
    ReactionEmoji,
    roleMention,
    User,
    userMention
} from "discord.js";

import {
    formatMessageContentForShortLog,
    formatBulkMessageLogEntry,
    Messages,
    prependReferenceLog, removeClientReactions
} from "@utils/messages";

import { handleQuickMute } from "@/commands/QuickMute30Ctx";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { DEFAULT_EMBED_COLOR, EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { cleanContent, cropLines, pluralize, userMentionWithId } from "@/utils";
import { ButtonStyle, Snowflake } from "discord-api-types/v10";
import { client, prisma } from "./..";
import { MessageReportFlag, MessageReportStatus, MessageReportUtil } from "@utils/reports";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { QuickMuteDuration } from "@utils/infractions";

import MuteRequestUtil, { MuteRequestStatus } from "@utils/muteRequests";
import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import Purge from "@/commands/Purge";
import Sentry from "@sentry/node";
import BanRequestUtil from "@utils/banRequests";

export default class MessageReactionAdd extends EventListener {
    constructor() {
        super(Events.MessageReactionAdd);
    }

    async execute(addedReaction: MessageReaction | PartialMessageReaction, user: User): Promise<void> {
        const reaction = await MessageReactionAdd._parseReaction(addedReaction);
        if (!reaction) return;

        const message = await MessageReactionAdd._parseMessage(reaction.message);
        if (!message || !message.inGuild()) return;

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

        const canUseEmoji = (emoji: keyof typeof config.data.emojis, permission: Permission): boolean => {
            return emojiId === config.data.emojis![emoji] && config.hasPermission(executor, permission);
        };

        // Handle a 30-minute quick mute
        if (canUseEmoji("quick_mute_30", Permission.QuickMute)) {
            await MessageReactionAdd._handleQuickMute({
                duration: QuickMuteDuration.Short,
                executor,
                message,
                config
            });
            return;
        }

        // Handle a one-hour quick mute
        if (canUseEmoji("quick_mute_60", Permission.QuickMute)) {
            await MessageReactionAdd._handleQuickMute({
                duration: QuickMuteDuration.Long,
                executor,
                message,
                config
            });
            return;
        }

        // Handle message purging
        if (canUseEmoji("purge_messages", Permission.PurgeMessages)) {
            await MessageReactionAdd._purgeUser(message, user.id, config);
            return;
        }

        // Handle message reports
        if (canUseEmoji("report_message", Permission.ReportMessages)) {
            await MessageReactionAdd.createMessageReport(user.id, message, config);
        }

        // Handle moderation requests
        MessageReactionAdd.handleModerationRequest(message, emojiId, executor, config);
    }

    private static async _parseReaction(reaction: PartialMessageReaction | MessageReaction): Promise<MessageReaction | null> {
        if (reaction.partial) {
            try {
                return await reaction.fetch();
            } catch {
                return null;
            }
        }

        return Promise.resolve(reaction);
    }

    private static async _parseMessage(message: PartialMessage | Message): Promise<Message | null> {
        if (message.partial) {
            try {
                return await message.fetch();
            } catch {
                return null;
            }
        }

        return Promise.resolve(message);
    }

    private static async _handleQuickMute(data: {
        message: Message<true>,
        executor: GuildMember,
        duration: QuickMuteDuration,
        config: GuildConfig
    }): Promise<void> {
        const { message, executor, duration, config } = data;

        try {
            const result = await handleQuickMute({
                targetMessage: message,
                duration,
                executor
            });

            if (!result.success) {
                config.sendNotification(`${executor} ${result.message}`);
            }
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            config.sendNotification(`${executor} An error occurred while trying to execute the quick mute (\`${sentryId}\`)`);
        }
    }

    static async handleModerationRequest(message: Message<true>, emojiId: string, executor: GuildMember, config: GuildConfig): Promise<void> {
        const isMuteRequestChannel = message.channelId === config.data.mute_requests?.channel_id;
        const isBanRequestChannel = message.channelId === config.data.ban_requests?.channel_id;

        if (isMuteRequestChannel && emojiId === config.data.emojis!.approve) {
            await MuteRequestUtil.approve(message, executor, config);
            return;
        }

        if (isBanRequestChannel && emojiId === config.data.emojis!.approve) {
            await BanRequestUtil.approve(message, executor, config);
            return;
        }

        if (isMuteRequestChannel && emojiId === config.data.emojis!.deny) {
            await MuteRequestUtil.deny(message, executor, config);
            return;
        }

        if (isBanRequestChannel && emojiId === config.data.emojis!.deny) {
            await BanRequestUtil.deny(message, executor, config);
            return;
        }

        if (isMuteRequestChannel) {
            await prisma.muteRequest.update({
                where: { id: message.id },
                data: { status: MuteRequestStatus.Unknown }
            }).catch(() => null);
        }

        if (isBanRequestChannel) {
            await prisma.banRequest.update({
                where: { id: message.id },
                data: { status: MuteRequestStatus.Unknown }
            }).catch(() => null);
        }

        const executorIsClient = executor.id === client.user.id;

        if (
            isMuteRequestChannel &&
            executorIsClient &&
            config.hasPermission(executor, Permission.ManageMuteRequests)
        ) {
            removeClientReactions(message);
        }

        if (
            isBanRequestChannel &&
            executorIsClient &&
            config.hasPermission(executor, Permission.ManageBanRequests)
        ) {
            removeClientReactions(message);
        }
    }

    static async createMessageReport(reporterId: Snowflake, message: Message<true>, config: GuildConfig): Promise<void> {
        // Message reports have not been configured
        if (!config.data.message_reports) return;

        const excludedRoles = config.data.message_reports.exclude_roles;
        const isExcluded = message.member?.roles.cache.some(role => excludedRoles.includes(role.id));

        // Don't report messages from users with excluded roles
        if (isExcluded || message.author.bot) return;

        const reportChannel = await config.guild.channels.fetch(config.data.message_reports.report_channel);

        // Ensure the report channel exists and is a text channel
        // An error should be thrown since the bot shouldn't be started with an incomplete configuration
        if (!reportChannel || !reportChannel.isTextBased()) {
            throw new Error(`Invalid report channel passed to \`message_reports.report_channel\` in the config for guild with ID ${config.guild.id}`);
        }

        // Check if there is an existing report for a message with the same content
        const content = cleanContent(message.content, message.channel);
        const originalReport = await prisma.messageReport.findFirst({
            where: {
                author_id: message.author.id,
                status: MessageReportStatus.Unresolved,
                OR: [
                    { content: content },
                    { message_id: message.id }
                ]
            }
        });

        const isSpam = originalReport
            // Check if the report already has a "Spam" flag
            && !(originalReport.flags & MessageReportFlag.Spam)
            // Check whether the message has already been reported
            && originalReport.message_id !== message.id;

        if (isSpam) {
            await prisma.messageReport.update({
                where: { id: originalReport.id },
                data: { flags: originalReport.flags | MessageReportFlag.Spam }
            });

            const report = await reportChannel.messages.fetch(originalReport.id)
                .catch(() => null);

            if (!report) {
                return;
            }

            const embed = await MessageReportUtil.updateFlags(report, originalReport.flags | MessageReportFlag.Spam);
            embed.setColor(Colors.Red);

            await report.edit({ embeds: [embed] });
            return;
        }

        // The message has already been reported
        if (originalReport) {
            return;
        }

        const croppedContent = cropLines(content, 5);
        let flags = 0;

        // Add a flag if the message has attachments
        if (message.attachments.size) flags |= MessageReportFlag.HasAttachment;

        const mappedFlags = MessageReportUtil.formatFlags(flags);
        const stickerId = message.stickers.first()?.id ?? null;

        const reportEmbed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setTitle("Message Report")
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
                    value: await formatMessageContentForShortLog(croppedContent, stickerId, message.url)
                }
            ])
            .setTimestamp();

        const reference = message.reference && await message.fetchReference()
            .catch(() => null);

        if (reference) {
            const referenceContent = cleanContent(reference.content, reference.channel);
            const croppedReferenceContent = cropLines(referenceContent, 5);
            const referenceStickerId = reference.stickers.first()?.id ?? null;
            const formattedReferenceContent = await formatMessageContentForShortLog(croppedReferenceContent, referenceStickerId, reference.url);

            // Insert the reference content before the actual message content
            reportEmbed.spliceFields(2, 0, {
                name: `Reference from @${reference.author.username} (${reference.author.id})`,
                value: formattedReferenceContent
            });
        }

        // Add flags to the embed if there are any
        if (mappedFlags.length) {
            reportEmbed.addFields({
                name: "Flags",
                value: mappedFlags
            });
        }

        // Mark the report as resolved
        const resolveMessageReportButton = new ButtonBuilder()
            .setCustomId(`message-report-resolve`)
            .setLabel("Resolve")
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

        const report = await reportChannel.send({
            content: mentionedRoles,
            embeds: [reportEmbed],
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
                reported_by: reporterId,
                status: MessageReportStatus.Unresolved,
                content,
                flags
            },
            update: {
                status: MessageReportStatus.Unresolved,
                created_at: new Date(),
                resolved_by: null,
                id: report.id
            }
        });

        reportEmbed.setTitle("New Message Report");

        log({
            event: LoggingEvent.MessageReportCreate,
            channel: message.channel,
            message: { embeds: [reportEmbed] },
            member: null,
            config
        });
    }

    private static async _purgeUser(message: Message<true>, executorId: Snowflake, config: GuildConfig): Promise<void> {
        const messages = await Purge.purgeUser(
            message.author.id,
            message.channel,
            config.data.default_purge_amount
        );

        if (!messages.length) {
            config.sendNotification(`No messages were purged.`);
            return;
        }

        const response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${message.author}`;
        const logURLs = await Purge.log(messages, message.channel, config);

        config.sendNotification(`${userMention(executorId)} ${response}: ${logURLs.join(" ")}`);
    }

    private static async _log(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User,
        config: GuildConfig
    ): Promise<void> {
        const content = cleanContent(message.content, message.channel);
        let logContent: MessageCreateOptions | null;

        if (content.length > EMBED_FIELD_CHAR_LIMIT) {
            logContent = await MessageReactionAdd._getLongLogContent(emoji, message, user);
        } else {
            logContent = await MessageReactionAdd._getShortLogContent(emoji, message, user);
        }

        if (!logContent) return;

        const member = await message.guild.members.fetch(user.id)
            .catch(() => null);

        log({
            event: LoggingEvent.MessageReactionAdd,
            channel: message.channel,
            message: logContent,
            member,
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
        const serializedMessage = Messages.serialize(message);
        await prependReferenceLog(serializedMessage, embeds);

        return { embeds };
    }

    private static async _getLongLogContent(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User
    ): Promise<MessageCreateOptions | null> {
        const serializedMessage = Messages.serialize(message);
        const entry = await formatBulkMessageLogEntry(serializedMessage);
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