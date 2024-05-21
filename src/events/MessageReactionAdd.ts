import {
    ActionRowBuilder,
    ButtonBuilder,
    Colors,
    EmbedBuilder,
    Events,
    GuildEmoji,
    hyperlink,
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
    formatMessageContentForLog,
    formatMessageLogEntry,
    prepareMessageForStorage,
    prependReferenceLog
} from "@utils/messages";

import { handleQuickMute } from "@/commands/QuickMute30Ctx";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { cropLines, pluralize, userMentionWithId } from "@/utils";
import { ButtonStyle, Snowflake } from "discord-api-types/v10";
import { approveModerationRequest, denyModerationRequest, RequestStatus } from "@utils/requests";
import { prisma } from "./..";
import { MessageReportFlag, MessageReportStatus } from "@utils/reports";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { MuteDuration } from "@utils/infractions";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import Purge from "@/commands/Purge";
import Sentry from "@sentry/node";

export default class MessageReactionAdd extends EventListener {
    constructor() {
        super(Events.MessageReactionAdd);
    }

    async execute(addedReaction: MessageReaction | PartialMessageReaction, user: User): Promise<void> {
        const reaction = addedReaction.partial
            ? await addedReaction.fetch().catch(() => null)
            : addedReaction;

        if (!reaction) return;

        const message = reaction.message.partial
            ? await reaction.message.fetch().catch(() => null) as Message<true> | null
            : reaction.message as Message<true>;

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
        if (emojiId === config.data.emojis.quick_mute_30 && config.hasPermission(executor, Permission.QuickMute)) {
            try {
                const res = await handleQuickMute({
                    duration: MuteDuration.Short,
                    targetMessage: message,
                    executor
                }, true);

                // Mention the executor with the error response
                if (!res.includes("Success")) {
                    config.sendNotification(`${user} ${res}`, true);
                }
            } catch (error) {
                const sentryId = Sentry.captureException(error);
                config.sendNotification(`${user} An error occurred while trying to execute the quick mute (\`${sentryId}\`)`);
            }

            return;
        }

        // Handle a one-hour quick mute
        if (emojiId === config.data.emojis.quick_mute_60 && config.hasPermission(executor, Permission.QuickMute)) {
            try {
                const res = await handleQuickMute({
                    targetMessage: message,
                    duration: MuteDuration.Long,
                    executor
                }, true);

                // Mention the executor with the error response
                if (!res.includes("Success")) {
                    config.sendNotification(`${user} ${res}`, true);
                }
            } catch (error) {
                const sentryId = Sentry.captureException(error);
                config.sendNotification(`${user} An error occurred while trying to execute the quick mute (\`${sentryId}\`)`);
            }

            return;
        }

        // Handle message purging
        if (emojiId === config.data.emojis.purge_messages && config.hasPermission(executor, Permission.PurgeMessages)) {
            await MessageReactionAdd._purgeUser(message, user.id, config);
            return;
        }

        // Handle message reports
        if (emojiId === config.data.emojis.report_message && config.hasPermission(executor, Permission.ReportMessages)) {
            await MessageReactionAdd.createMessageReport(user.id, message, config);
        }

        const isModerationRequestChannel = config.data.moderation_requests
            .some(requestConfig => requestConfig.channel_id === message.channelId);

        // Handle moderation request approvals
        // Permission checks are performed in approval function
        if (isModerationRequestChannel && emojiId === config.data.emojis.approve) {
            await approveModerationRequest(message.id, user.id, config);
            return;
        }

        // Handle moderation request denials
        // Permission checks are performed in denial function
        if (isModerationRequestChannel && emojiId === config.data.emojis.deny) {
            await denyModerationRequest(message.id, user.id, config);
            return;
        }

        if (isModerationRequestChannel) {
            await prisma.moderationRequest.update({
                where: { id: message.id },
                data: { status: RequestStatus.Unknown }
            }).catch(() => null);
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

        // Ensure the alert channel exists and is a text channel
        // An error should be thrown since the bot shouldn't be started with an incomplete configuration
        if (!reportChannel || !reportChannel.isTextBased()) {
            throw new Error(`Invalid report channel passed to \`message_reports.alert_channel\` in the config for guild with ID ${config.guild.id}`);
        }

        const originalReport = await prisma.messageReport.findFirst({
            where: {
                content: message.content,
                author_id: message.author.id,
                status: MessageReportStatus.Unresolved
            }
        });

        const isSpam = originalReport
            && !(originalReport.flags & MessageReportFlag.Spam)
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

            const mappedFlags = MessageReactionAdd._mapMessageReportFlags(originalReport.flags | MessageReportFlag.Spam);
            const embed = new EmbedBuilder(report.embeds[0].toJSON()).setColor(Colors.Red);

            if (embed.data.fields!.find(field => field.name === "Flags")) {
                embed.spliceFields(-1, 1, {
                    name: "Flags",
                    value: mappedFlags
                });
            } else {
                embed.addFields({
                    name: "Flags",
                    value: mappedFlags
                });
            }

            await report.edit({ embeds: [embed] });
            return;
        }

        // The message has already been reported
        if (originalReport) {
            return;
        }

        // Flags mapped by their names for the report
        const croppedContent = cropLines(message.content, 5);
        // Bitwise flags for storage
        let flags = 0;

        // Add a flag if the message has attachments
        if (message.attachments.size) flags |= MessageReportFlag.HasAttachment;

        const mappedFlags = MessageReactionAdd._mapMessageReportFlags(flags);
        const stickerId = message.stickers.first()?.id ?? null;

        const alert = new EmbedBuilder()
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
                    value: await formatMessageContentForLog(croppedContent, stickerId, message.url)
                }
            ])
            .setTimestamp();

        const reference = message.reference && await message.fetchReference()
            .catch(() => null);

        if (reference) {
            const croppedReference = cropLines(reference.content, 5);
            const referenceStickerId = reference.stickers.first()?.id ?? null;

            // Insert the reference content before the actual message content
            alert.spliceFields(2, 0, {
                name: `Reference from @${reference.author.username} (${reference.author.id})`,
                value: await formatMessageContentForLog(croppedReference, referenceStickerId, reference.url)
            });
        }

        // Add flags to the embed if there are any
        if (mappedFlags.length) {
            alert.addFields({
                name: "Flags",
                value: mappedFlags
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

        const report = await reportChannel.send({
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

    private static _mapMessageReportFlags(flags: number): string {
        const entries = Object.entries(MessageReportFlag)
            .filter((entry): entry is [string, MessageReportFlag] => {
                return typeof entry[1] !== "string" && Boolean(flags & entry[1]);
            });

        return entries.map(entry => `\`${entry[0]}\``).join(", ");
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
        const logUrls = await Purge.log(messages, message.channel, config);

        config.sendNotification(`${userMention(executorId)} ${response}: ${logUrls.join(" ")}`);
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