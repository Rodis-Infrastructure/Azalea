import {
    ApplicationCommandOptionType,
    AttachmentBuilder,
    channelMention,
    ChatInputCommandInteraction,
    GuildChannel,
    OverwriteData,
    PermissionFlagsBits,
    Snowflake
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";

export default class Lockdown extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "lockdown",
            description: "Lockdown the server",
            options: [
                {
                    name: LockdownSubcommand.Start,
                    description: "Start the lockdown",
                    type: ApplicationCommandOptionType.Subcommand
                },
                {
                    name: LockdownSubcommand.End,
                    description: "End the lockdown",
                    type: ApplicationCommandOptionType.Subcommand
                }
            ]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return Promise.resolve("I don't have the required permissions to manage channels.");
        }

        const subcommand = interaction.options.getSubcommand() as LockdownSubcommand;

        switch (subcommand) {
            case LockdownSubcommand.Start:
                return Lockdown._startLockdown(interaction);
            case LockdownSubcommand.End:
                return Lockdown._endLockdown(interaction);
        }
    }

    private static async _startLockdown(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true).data.lockdown;

        if (!config) {
            return "This server does not have a lockdown configuration.";
        }

        const isLocked = await prisma.permissionOverwrites.findUnique({
            where: { guild_id: interaction.guildId }
        });

        if (isLocked) {
            return "The server is already in lockdown.";
        }

        const currentPermissionOverwrites = [];
        const failedChannelIds: Snowflake[] = [];
        const changes = [];

        for (const data of config.channels) {
            // The default_permission_overwrites property will be defined if permission_overwrites isn't
            const permissionOverwrites = data.permission_overwrites ?? config.default_permission_overwrites!;

            try {
                const channel = await interaction.guild.channels.fetch(data.channel_id) as GuildChannel | null;
                if (!channel) continue;

                channel.edit({
                    reason: `Server lockdown initiated by @${interaction.user.username} (${interaction.user.id})`,
                    permissionOverwrites
                });

                const currentChannelPermissionOverwrites = channel.permissionOverwrites.cache
                    .map(permissionOverwrite => ({
                        id: permissionOverwrite.id,
                        type: permissionOverwrite.type,
                        allow: permissionOverwrite.allow.bitfield.toString(),
                        deny: permissionOverwrite.deny.bitfield.toString()
                    }));

                currentPermissionOverwrites.push({
                    channel_id: channel.id,
                    overwrites: currentChannelPermissionOverwrites
                });

                changes.push({
                    channel: `#${channel.name} (${channel.id})`,
                    overwrites: permissionOverwrites
                });
            } catch {
                failedChannelIds.push(data.channel_id);
            }
        }

        await prisma.permissionOverwrites.create({
            data: {
                guild_id: interaction.guildId,
                overwrites: JSON.stringify(currentPermissionOverwrites)
            }
        });

        const stringifiedChanges = JSON.stringify(changes, null, 2);
        const attachment = new AttachmentBuilder(Buffer.from(stringifiedChanges))
            .setName("lockdown_changes.json")
            .setDescription("An array of changes made to the channels during the lockdown.");

        if (failedChannelIds.length) {
            const channelMentions = failedChannelIds.map(channelMention).join(", ");

            return {
                content: `Failed to lock down the following channels: ${channelMentions}`,
                files: [attachment]
            };
        }

        return {
            content: "Successfully locked down the server.",
            files: [attachment]
        };
    }

    private static async _endLockdown(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const initialPermissionOverwrites = await prisma.permissionOverwrites.delete({
            where: { guild_id: interaction.guildId }
        }).catch(() => null);

        if (!initialPermissionOverwrites) {
            return "The server is not in lockdown.";
        }

        const failedChannelIds: Snowflake[] = [];

        JSON.parse(initialPermissionOverwrites.overwrites).forEach(async (data: {
            channel_id: Snowflake,
            overwrites: OverwriteData[]
        }) => {
            try {
                const channel = await interaction.guild.channels.fetch(data.channel_id) as GuildChannel | null;
                if (!channel) return;

                channel.edit({
                    reason: `Server lockdown ended by @${interaction.user.username} (${interaction.user.id})`,
                    permissionOverwrites: data.overwrites
                });
            } catch {
                failedChannelIds.push(data.channel_id);
            }
        });

        if (failedChannelIds.length) {
            const channelMentions = failedChannelIds.map(channelMention).join(", ");
            return `Failed to unlock the following channels: ${channelMentions}`;
        }

        return "Successfully ended the lockdown.";
    }
}

enum LockdownSubcommand {
    Start = "start",
    End = "end"
}