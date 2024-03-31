import {
    EmbedBuilder,
    Events,
    GuildEmoji,
    hyperlink,
    Message,
    MessageCreateOptions,
    MessageReaction,
    PartialMessageReaction,
    ReactionEmoji,
    User, userMention
} from "discord.js";

import { prepareMessageForStorage, prependReferenceLog, resolvePartialMessage } from "@utils/messages";
import { handleQuickMute, THIRTY_MINUTES } from "@/commands/QuickMute30Ctx";
import { log, mapLogEntriesToFile } from "@utils/logging";
import { formatMessageLogEntry } from "./MessageBulkDelete";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import EventListener from "@managers/events/EventListener";
import { handlePurgeLog, purgeUser } from "@/commands/Purge";
import { pluralize } from "@/utils";
import { Snowflake } from "discord-api-types/v10";
import { ONE_HOUR } from "@/commands/QuickMute60Ctx";
import { approveRequest, denyRequest } from "@utils/requests";

export default class MessageReactionAddEventListener extends EventListener {
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
            this.handleMessageReactionAddLog(reaction.emoji, message, user, config);
        }

        const emojiId = this.getEmojiId(reaction.emoji);
        const executor = await message.guild.members.fetch(user.id);

        // Handle a 30-minute quick mute
        if (emojiId === config.data.emojis.quick_mute_30) {
            await this.handleReactionQuickMute({
                duration: THIRTY_MINUTES,
                targetMessage: message,
                executor
            }, config);

            return;
        }

        // Handle a one-hour quick mute
        if (emojiId === config.data.emojis.quick_mute_60) {
            await this.handleReactionQuickMute({
                targetMessage: message,
                duration: ONE_HOUR,
                executor
            }, config);

            return;
        }

        // Handle message purging
        if (emojiId === config.data.emojis.purge_messages) {
            await this.handleReactionMessagePurging(message, user.id, config);
            return;
        }

        if (emojiId === config.data.emojis.approve) {
            await approveRequest(message.id, user.id, config);
            return;
        }

        if (emojiId === config.data.emojis.deny) {
            await denyRequest(message, user.id, config);
        }
    }

    async handleReactionMessagePurging(message: Message<true>, executorId: Snowflake, config: GuildConfig): Promise<void> {
        const messages = await purgeUser(
            message.author.id,
            message.channel,
            config.data.default_purge_amount
        );

        const response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${message.author}`;
        const logUrls = await handlePurgeLog(messages, message.channel, config);

        config.sendNotification(`${userMention(executorId)} ${response}: ${logUrls.join(" ")}`);
    }

    async handleReactionQuickMute(data: Parameters<typeof handleQuickMute>[number], config: GuildConfig): Promise<void> {
        const response = await handleQuickMute(data);
        config.sendNotification(`${data.executor} ${response}`);
    }

    async handleMessageReactionAddLog(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User,
        config: GuildConfig
    ): Promise<void> {
        let logContent: MessageCreateOptions | null;

        if (message.content.length > EMBED_FIELD_CHAR_LIMIT) {
            logContent = await this.getLongLogContent(emoji, message, user);
        } else {
            logContent = await this.getShortLogContent(emoji, message, user);
        }

        if (!logContent) return;

        log({
            event: LoggingEvent.MessageReactionAdd,
            channel: message.channel,
            message: logContent,
            config
        });
    }

    async getShortLogContent(
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
                    value: this.parseEmoji(emoji)
                }
            ])
            .setTimestamp();

        const embeds = [embed];
        await prependReferenceLog(message.id, embeds);

        return { embeds };
    }

    async getLongLogContent(
        emoji: GuildEmoji | ReactionEmoji,
        message: Message<true>,
        user: User
    ): Promise<MessageCreateOptions | null> {
        const serializedMessage = prepareMessageForStorage(message);
        const entry = await formatMessageLogEntry(serializedMessage);
        const file = mapLogEntriesToFile([entry]);

        return {
            content: `Reaction ${this.parseEmoji(emoji)} added to message in ${message.channel} by ${user}`,
            allowedMentions: { parse: [] },
            files: [file]
        };
    }

    /** @returns The emoji ID and URL if the emoji is a custom emoji, otherwise the emoji name */
    parseEmoji(emoji: GuildEmoji | ReactionEmoji): string {
        if (emoji.id) {
            const maskedEmojiURL = hyperlink("view", `<${emoji.imageURL()}>`);
            return `\`<:${emoji.name}:${emoji.id}>\` (${maskedEmojiURL})`;
        }

        return emoji.toString();
    }

    getEmojiId(emoji: GuildEmoji | ReactionEmoji): string | null {
        return emoji.name || emoji.id;
    }
}