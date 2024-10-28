import {
	ApplicationCommandOptionType,
	AttachmentBuilder,
	channelMention,
	ChatInputCommandInteraction,
	GuildChannel,
	PermissionFlagsBits,
	Snowflake
} from "discord.js";

import { PermissionOverwrite } from "@managers/config/schema";
import { InteractionReplyData } from "@utils/types";
import { stringifyJSON } from "@/utils";
import { prisma } from "./..";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";
import _ from "lodash";

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
			return Promise.resolve("I cannot perform this action without the `Manage Channels` permission.");
		}

		const subcommand = interaction.options.getSubcommand() as LockdownSubcommand;

		switch (subcommand) {
			case LockdownSubcommand.Start:
				return Lockdown._startLockdown(interaction);
			case LockdownSubcommand.End:
				return Lockdown._endLockdown(interaction);
		}
	}

	/**
     * Initiate a guild lockdown by applying the configured permission
     * overwrites to the specified channels.
     *
     * @param interaction - The interaction object.
     * @returns The reply data.
     * @private
     */
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

		const preLockdownOverwrites: ChannelOverwrite[] = [];
		// Channels that failed to be locked down
		const failedChannelIds: Snowflake[] = [];
		const diff = [];

		for (const data of config.channels) {
			// The default_permission_overwrites property will be defined if permission_overwrites isn't,
			// the validation is performed by zod.
			const overwrites: PermissionOverwrite[] = data.permission_overwrites ?? config.default_permission_overwrites!;
			const channel = await interaction.guild.channels.fetch(data.channel_id) as GuildChannel | null;

			if (!channel) {
				failedChannelIds.push(data.channel_id);
				continue;
			}

			// Channel-specific permission overwrites before the lockdown.
			const preLockdownChannelOverwrites: PermissionOverwrite[] = channel.permissionOverwrites.cache
				.map(overwrite => {
					return {
						id: overwrite.id,
						allow: overwrite.allow.toArray(),
						deny: overwrite.deny.toArray()
					};
				});

			// Append the channel-specific overwrites to the pre-lockdown state
			preLockdownOverwrites.push({
				channel_id: channel.id,
				overwrites: preLockdownChannelOverwrites
			});

			for (const preLockdownOverwrite of preLockdownChannelOverwrites) {
				const overwrite = overwrites.find(({ id }) => id === preLockdownOverwrite.id);
				if (!overwrite) continue;

				// Only retain the pre-lockdown permissions that aren't present in the contrary array
				// and append the lockdown permissions. This is done to ensure that non-overwritten permissions
				// are retained during the lockdown.
				overwrites.push({
					id: preLockdownOverwrite.id,
					allow: _
						.difference(preLockdownOverwrite.allow, overwrite.deny)
						.concat(overwrite.allow),
					deny: _
						.difference(preLockdownOverwrite.deny, overwrite.allow)
						.concat(overwrite.deny)
				});
			}

			// Apply the lockdown overwrites to the channel
			channel.edit({
				reason: `Server lockdown initiated by @${interaction.user.username} (${interaction.user.id})`,
				permissionOverwrites: overwrites
			}).catch(() => {
				failedChannelIds.push(channel.id);
			});

			diff.push({
				channel: `#${channel.name} (${channel.id})`,
				overwrites: overwrites
			});
		}

		await prisma.permissionOverwrites.create({
			data: {
				guild_id: interaction.guildId,
				overwrites: stringifyJSON(preLockdownOverwrites)
			}
		});

		const stringifiedDiff = JSON.stringify(diff, null, 2);
		const diffTextFile = new AttachmentBuilder(Buffer.from(stringifiedDiff))
			.setName("lockdown_changes.json")
			.setDescription("An array of changes made to the channels during the lockdown.");

		if (failedChannelIds.length) {
			const channelMentions = failedChannelIds.map(channelMention).join(", ");

			return {
				content: `Failed to lock down the following channels: ${channelMentions}`,
				files: [diffTextFile]
			};
		}

		return {
			content: "Successfully locked down the server.",
			files: [diffTextFile]
		};
	}

	/**
     * End the server lockdown by reverting the permission overwrites
     * using the stored pre-lockdown state.
     *
     * @param interaction - The interaction object.
     * @returns The reply data.
     * @private
     */
	private static async _endLockdown(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const preLockdownPermissionOverwrites = await prisma.permissionOverwrites.delete({
			where: { guild_id: interaction.guildId }
		}).catch(() => null);

		if (!preLockdownPermissionOverwrites) {
			return "The server is not in lockdown.";
		}

		// Channels that failed to be unlocked
		const failedChannelIds: Snowflake[] = [];

		JSON.parse(preLockdownPermissionOverwrites.overwrites).forEach(async (data: ChannelOverwrite) => {
			const channel = await interaction.guild.channels.fetch(data.channel_id) as GuildChannel | null;

			if (!channel) {
				failedChannelIds.push(data.channel_id);
				return;
			}

			// Apply the pre-lockdown overwrites to the channel
			channel.edit({
				reason: `Server lockdown ended by @${interaction.user.username} (${interaction.user.id})`,
				permissionOverwrites: data.overwrites
			}).catch(() => {
				failedChannelIds.push(data.channel_id);
			});
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

interface ChannelOverwrite {
    channel_id: Snowflake;
    overwrites: PermissionOverwrite[];
}