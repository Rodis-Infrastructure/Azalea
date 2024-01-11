import {
    EmbedBuilder,
    Events,
    GuildEmoji,
    GuildMember,
    Message,
    MessageReaction,
    ReactionEmoji,
    User
} from "discord.js";

import { prependReferenceLog, resolvePartialMessage } from "../utils/messages.ts";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class MessageReactionAddEventListener extends EventListener {
    constructor() {
        super(Events.MessageReactionAdd);
    }

    async execute(reaction: MessageReaction, user: User): Promise<void> {
        const message = await resolvePartialMessage(reaction.message);
        if (!message) return;

        const config = ConfigManager.getGuildConfig(message.guildId);
        if (!config) return;

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        // Only log the first reaction
        if (reaction.count === 1) {
            await handleReactionAddLog(reaction, message, member, config);
        }
    }
}

async function handleReactionAddLog(reaction: MessageReaction, message: Message<true>, member: GuildMember, config: GuildConfig): Promise<void> {
    const embed = new EmbedBuilder()
        .setColor(0x9C84EF) // Light purple
        .setAuthor({ name: "Reaction Added" })
        .setFields([
            {
                name: "Reaction Author",
                value: `${member} (\`${member.id}\`)`
            },
            {
                name: "Channel",
                value: `${message.channel} (\`#${message.channel.name}\`)`
            },
            {
                name: "Emoji",
                value: resolveEmojiName(reaction.emoji)
            }
        ])
        .setTimestamp();

    const embeds = [embed];
    await prependReferenceLog(message.id, embeds);

    await log({
        event: LoggingEvent.ReactionAdd,
        channel: message.channel,
        embeds,
        member,
        config
    });
}

// @returns The emoji ID if the emoji is a custom emoji, otherwise the emoji name
function resolveEmojiName(emoji: GuildEmoji | ReactionEmoji): string {
    if (emoji.id) {
        return `\`<:${emoji.name}:${emoji.id}>\``;
    }

    return emoji.toString();
}