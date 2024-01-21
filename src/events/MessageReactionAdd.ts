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
    User
} from "discord.js";

import { prepareMessageForStorage, prependReferenceLog, resolvePartialMessage } from "../utils/messages.ts";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log, mapLogEntriesToFile } from "../utils/logging.ts";
import { formatMessageLogEntry } from "./MessageBulkDelete.ts";
import { EMBED_FIELD_CHAR_LIMIT } from "../utils/constants.ts";

import EventListener from "../handlers/events/EventListener.ts";

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
            await handleReactionAddLog(reaction.emoji, message, user, config);
        }
    }
}

async function handleReactionAddLog(
    emoji: GuildEmoji | ReactionEmoji,
    message: Message<true>,
    user: User,
    config: GuildConfig
): Promise<void> {
    let logContent: MessageCreateOptions | null;

    if (message.content.length > EMBED_FIELD_CHAR_LIMIT) {
        logContent = await getLongReactionAddLogContent(emoji, message, user);
    } else {
        logContent = await getShortReactionAddLogContent(emoji, message, user);
    }

    if (!logContent) return;

    await log({
        event: LoggingEvent.MessageReactionAdd,
        channel: message.channel,
        message: logContent,
        config
    });
}

async function getShortReactionAddLogContent(
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
                value: resolveEmojiName(emoji)
            }
        ])
        .setTimestamp();

    const embeds = [embed];
    await prependReferenceLog(message.id, embeds);

    return { embeds };
}

async function getLongReactionAddLogContent(
    emoji: GuildEmoji | ReactionEmoji,
    message: Message<true>,
    user: User
): Promise<MessageCreateOptions | null> {
    const serializedMessage = prepareMessageForStorage(message);
    const entry = await formatMessageLogEntry(serializedMessage);
    const file = mapLogEntriesToFile([entry]);

    return {
        content: `Reaction ${resolveEmojiName(emoji)} added to message in ${message.channel} by ${user}`,
        allowedMentions: { parse: [] },
        files: [file]
    };
}

// @returns The emoji ID and URL if the emoji is a custom emoji, otherwise the emoji name
function resolveEmojiName(emoji: GuildEmoji | ReactionEmoji): string {
    if (emoji.id) {
        const maskedEmojiURL = hyperlink("view", `<${emoji.imageURL()}>`);
        return `\`<:${emoji.name}:${emoji.id}>\` (${maskedEmojiURL})`;
    }

    return emoji.toString();
}