import { Colors, EmbedBuilder, Events, VoiceBasedChannel, VoiceState } from "discord.js";
import { channelMentionWithName, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class VoiceStateUpdateEventListener extends EventListener {
    constructor() {
        super(Events.VoiceStateUpdate);
    }

    execute(oldState: VoiceState, newState: VoiceState): void {
        // Ignore if the channel ID remains the same (e.g. the user toggled their microphone)
        if (oldState.channelId === newState.channelId) return;

        const channel = newState.channel || oldState.channel;
        if (!channel) return;

        const config = ConfigManager.getGuildConfig(newState.guild.id);
        if (!config) return;

        this.handleVoiceStateUpdateLog(oldState, newState, channel, config);
    }

    handleVoiceStateUpdateLog(
        oldState: VoiceState,
        newState: VoiceState,
        channel: VoiceBasedChannel,
        config: GuildConfig
    ): void {
        let event!: LoggingEvent.VoiceJoin | LoggingEvent.VoiceLeave | LoggingEvent.VoiceSwitch;
        let embed!: EmbedBuilder;

        // User joined a voice channel
        if (!oldState.channelId && newState.channelId) {
            event = LoggingEvent.VoiceJoin;
            embed = this.getVoiceJoinLogEmbed(newState);
        }

        // User left a voice channel
        if (oldState.channelId && !newState.channelId) {
            event = LoggingEvent.VoiceLeave;
            embed = this.getVoiceLeaveLogEmbed(oldState);
        }

        // User switched voice channels
        if (oldState.channelId && newState.channelId) {
            event = LoggingEvent.VoiceSwitch;
            embed = this.getVoiceSwitchLogEmbed(oldState, newState);
        }

        log({
            message: {
                embeds: [embed]
            },
            channel,
            config,
            event
        });
    }

    getVoiceJoinLogEmbed(newState: VoiceState): EmbedBuilder {
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

    getVoiceLeaveLogEmbed(oldState: VoiceState): EmbedBuilder {
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

    getVoiceSwitchLogEmbed(oldState: VoiceState, newState: VoiceState): EmbedBuilder {
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
}