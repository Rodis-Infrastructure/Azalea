import { Colors, EmbedBuilder, Events, VoiceBasedChannel, VoiceState } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "../utils";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";

export default class VoiceStateUpdateEventListener extends EventListener {
    constructor() {
        super(Events.VoiceStateUpdate);
    }

    async execute(oldState: VoiceState, newState: VoiceState): Promise<void> {
        // Ignore if the channel ID remains the same (e.g. the user toggled their microphone)
        if (oldState.channelId === newState.channelId) return;

        const channel = newState.channel || oldState.channel;
        if (!channel) return;

        const config = ConfigManager.getGuildConfig(newState.guild.id);
        if (!config) return;

        await handleVoiceStateUpdateLog(oldState, newState, channel, config);
    }
}

async function handleVoiceStateUpdateLog(
    oldState: VoiceState,
    newState: VoiceState,
    channel: VoiceBasedChannel,
    config: GuildConfig
): Promise<void> {
    let event!: LoggingEvent.VoiceJoin | LoggingEvent.VoiceLeave | LoggingEvent.VoiceSwitch;
    let embed!: EmbedBuilder;

    // User joined a voice channel
    if (!oldState.channelId && newState.channelId) {
        event = LoggingEvent.VoiceJoin;
        embed = getVoiceJoinLogEmbed(newState);
    }

    // User left a voice channel
    if (oldState.channelId && !newState.channelId) {
        event = LoggingEvent.VoiceLeave;
        embed = getVoiceLeaveLogEmbed(oldState);
    }

    // User switched voice channels
    if (oldState.channelId && newState.channelId) {
        event = LoggingEvent.VoiceSwitch;
        embed = getVoiceSwitchLogEmbed(oldState, newState);
    }

    await log({
        message: {
            embeds: [embed]
        },
        channel,
        config,
        event
    });
}

function getVoiceJoinLogEmbed(newState: VoiceState): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.Green)
        .setAuthor({ name: "Voice Join" })
        .setFields([
            {
                name: "User",
                value: userMentionWithId(newState.id)
            },
            {
                name: "Channel",
                value: channelMentionWithName(newState.channel!)
            }
        ])
        .setTimestamp();
}

function getVoiceLeaveLogEmbed(oldState: VoiceState): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(Colors.Red)
        .setAuthor({ name: "Voice Leave" })
        .setFields([
            {
                name: "User",
                value: userMentionWithId(oldState.id)
            },
            {
                name: "Channel",
                value: channelMentionWithName(oldState.channel!)
            }
        ])
        .setTimestamp();
}

function getVoiceSwitchLogEmbed(oldState: VoiceState, newState: VoiceState): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(0x9C84EF) // Light purple
        .setAuthor({ name: "Voice Switch" })
        .setFields([
            {
                name: "User",
                value: userMentionWithId(newState.id)
            },
            {
                name: "Channel (Before)",
                value: channelMentionWithName(oldState.channel!)
            },
            {
                name: "Channel (After)",
                value: channelMentionWithName(newState.channel!)
            }
        ])
        .setTimestamp();
}