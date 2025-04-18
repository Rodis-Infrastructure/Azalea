import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import safe from "safe-regex";

import { ApplicationCommandOptionType, ChatInputCommandInteraction, Colors, EmbedBuilder } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { pluralize } from "@/utils";
import { Permission } from "@managers/config/schema";

const PATTERN_LIMIT = 20;
const PATTERN_CHAR_LIMIT = 45;
const CHANNEL_LIMIT = 40;

export default class Highlight extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "highlight",
			description: "Manage pattern-based message notifications",
			options: [
				{
					name: HighlightSubcommandGroup.Pattern,
					description: "Manage patterns for message notifications",
					type: ApplicationCommandOptionType.SubcommandGroup,
					options: [
						{
							name: HighlightPatternSubcommand.Add,
							description: "Add a pattern to your highlights",
							type: ApplicationCommandOptionType.Subcommand,
							options: [{
								name: "pattern",
								description: "The pattern to add",
								type: ApplicationCommandOptionType.String,
								max_length: PATTERN_CHAR_LIMIT,
								required: true
							}]
						},
						{
							name: HighlightPatternSubcommand.Remove,
							description: "Remove a pattern from your highlights",
							type: ApplicationCommandOptionType.Subcommand,
							options: [{
								name: "pattern",
								description: "The pattern to remove",
								type: ApplicationCommandOptionType.String,
								required: true
							}]
						},
						{
							name: HighlightPatternSubcommand.Clear,
							description: "Clear all patterns from your highlights",
							type: ApplicationCommandOptionType.Subcommand
						}
					]
				},
				{
					name: HighlightSubcommandGroup.Channel,
					description: "Manage channels for message notifications",
					type: ApplicationCommandOptionType.SubcommandGroup,
					options: [
						{
							name: HighlightChannelSubcommand.Add,
							description: "Configure a channel's scope for highlights",
							type: ApplicationCommandOptionType.Subcommand,
							options: [
								{
									name: "channel",
									description: "The channel to add to the scope",
									type: ApplicationCommandOptionType.Channel,
									required: true
								},
								{
									name: "type",
									description: "The type of scoping",
									type: ApplicationCommandOptionType.Integer,
									required: true,
									choices: [
										{ name: "Whitelist", value: HighlightChannelScopingType.Whitelist },
										{ name: "Blacklist", value: HighlightChannelScopingType.Blacklist }
									]
								}
							]
						},
						{
							name: HighlightChannelSubcommand.Remove,
							description: "Remove a channel from highlights",
							type: ApplicationCommandOptionType.Subcommand,
							options: [{
								name: "channel",
								description: "The channel to remove from the scope",
								type: ApplicationCommandOptionType.Channel,
								required: true
							}]
						},
						{
							name: HighlightChannelSubcommand.Clear,
							description: "Clear all channels from highlights",
							type: ApplicationCommandOptionType.Subcommand
						}
					]
				},
				{
					name: HighlightSubcommand.List,
					description: "List all patterns and channels in your highlights",
					type: ApplicationCommandOptionType.Subcommand,
					options: [{
						name: "user",
						description: "The user to list highlights for",
						type: ApplicationCommandOptionType.User,
						required: false
					}]
				},
				{
					name: HighlightSubcommand.Erase,
					description: "Erase a user's highlights",
					type: ApplicationCommandOptionType.Subcommand,
					options: [{
						name: "user",
						description: "The user to erase highlights for",
						type: ApplicationCommandOptionType.User,
						required: true
					}]
				}
			]
		});
	}

	execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const subcommandGroup = interaction.options.getSubcommandGroup();
		const subcommand = interaction.options.getSubcommand(true);

		if (!subcommandGroup) {
			switch (subcommand as HighlightSubcommand) {
				case HighlightSubcommand.List:
					return Highlight._listHighlights(interaction);
				case HighlightSubcommand.Erase:
					return Highlight._eraseHighlights(interaction);
				default:
					return Promise.resolve({
						content: "Unknown subcommand",
						ephemeral: true
					});
			}
		}

		if (subcommandGroup === HighlightSubcommandGroup.Pattern) {
			switch (subcommand as HighlightPatternSubcommand) {
				case HighlightPatternSubcommand.Add:
					return Highlight._addPattern(interaction);
				case HighlightPatternSubcommand.Remove:
					return Highlight._removePattern(interaction);
				case HighlightPatternSubcommand.Clear:
					return Highlight._clearPatterns(interaction);
				default:
					return Promise.resolve({
						content: "Unknown subcommand",
						ephemeral: true
					});
			}
		}

		if (subcommandGroup === HighlightSubcommandGroup.Channel) {
			switch (subcommand as HighlightChannelSubcommand) {
				case HighlightChannelSubcommand.Add:
					return Highlight._addChannelScoping(interaction);
				case HighlightChannelSubcommand.Remove:
					return Highlight._removeChannelScoping(interaction);
				case HighlightChannelSubcommand.Clear:
					return Highlight._clearChannelScoping(interaction);
				default:
					return Promise.resolve({
						content: "Unknown subcommand",
						ephemeral: true,
						temporary: true
					});
			}
		}

		return Promise.resolve({
			content: "Unknown subcommand",
			ephemeral: true,
			temporary: true
		});
	}

	private static async _addPattern(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const pattern = interaction.options.getString("pattern", true);
		const patternCount = await prisma.highlightPattern.count({
			where: {
				user_id: interaction.user.id,
				guild_id: interaction.guild.id
			}
		});

		if (patternCount === PATTERN_LIMIT) {
			return {
				content: `You have reached the maximum of \`${PATTERN_LIMIT}\` patterns.`,
				temporary: true,
				ephemeral: true
			};
		}

		const regexPattern = pattern.replaceAll("*", "(\n|\r|.)*");
		const isSafePattern = safe(regexPattern);

		if (!isSafePattern) {
			return {
				content: "Failed to add pattern. The pattern provided has been flagged as unsafe or it exceeds the repetition limit (`25`).",
				ephemeral: true,
				temporary: true
			};
		}

		try {
			await prisma.highlight.upsert({
				where: {
					user_id_guild_id: {
						user_id: interaction.user.id,
						guild_id: interaction.guild.id
					}
				},
				update: {
					patterns: {
						create: { pattern }
					}
				},
				create: {
					user_id: interaction.user.id,
					guild_id: interaction.guild.id,
					patterns: {
						create: { pattern }
					}
				}
			});
		} catch {
			return {
				content: "Failed to add pattern. Please check whether the pattern is a duplicate.",
				ephemeral: true,
				temporary: true
			};
		}

		return `Successfully added \`${pattern}\` to your highlights (${patternCount + 1}/${PATTERN_LIMIT})`;
	}

	private static async _removePattern(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const pattern = interaction.options.getString("pattern", true);

		try {
			await prisma.highlightPattern.delete({
				where: {
					user_id_guild_id_pattern: {
						user_id: interaction.user.id,
						guild_id: interaction.guild.id,
						pattern
					}
				}
			});
		} catch {
			return {
				content: "Failed to remove pattern. Please check whether the pattern exists.",
				ephemeral: true,
				temporary: true
			};
		}

		return `Successfully removed \`${pattern}\` from your highlights.`;
	}

	private static async _clearPatterns(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		await prisma.highlightPattern.deleteMany({
			where: {
				user_id: interaction.user.id,
				guild_id: interaction.guild.id
			}
		});

		return "Successfully cleared all patterns from your highlights.";
	}

	private static async _addChannelScoping(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const channel = interaction.options.getChannel("channel", true);
		const scopingType = interaction.options.getInteger("type", true);
		const stringifiedScopingType = scopingType === HighlightChannelScopingType.Whitelist ? "whitelist" : "blacklist";
		const channelCount = await prisma.highlightChannelScoping.count({
			where: {
				user_id: interaction.user.id,
				guild_id: interaction.guild.id,
				type: scopingType
			}
		});

		if (channelCount === CHANNEL_LIMIT) {
			return {
				content: `You have reached the maximum of \`${CHANNEL_LIMIT}\` ${stringifiedScopingType}ed channels.`,
				ephemeral: true,
				temporary: true
			};
		}

		try {
			await prisma.highlight.upsert({
				where: {
					user_id_guild_id: {
						user_id: interaction.user.id,
						guild_id: interaction.guild.id
					}
				},
				update: {
					channel_scoping: {
						create: {
							channel_id: channel.id,
							type: scopingType
						}
					}
				},
				create: {
					user_id: interaction.user.id,
					guild_id: interaction.guild.id,
					channel_scoping: {
						create: {
							channel_id: channel.id,
							type: scopingType
						}
					}
				}
			});
		} catch {
			return {
				content: `Failed to ${stringifiedScopingType} ${channel}. Please check whether the channel is already in the scope.`,
				ephemeral: true,
				temporary: true
			};
		}

		return `Successfully ${stringifiedScopingType}ed ${channel} for your highlights (${channelCount + 1}/${CHANNEL_LIMIT})`;
	}

	private static async _removeChannelScoping(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const channel = interaction.options.getChannel("channel", true);

		try {
			await prisma.highlightChannelScoping.delete({
				where: {
					user_id_guild_id_channel_id: {
						user_id: interaction.user.id,
						guild_id: interaction.guild.id,
						channel_id: channel.id
					}
				}
			});
		} catch {
			return {
				content: `Failed to remove ${channel} from highlights. Please check whether the channel is in the scope.`,
				ephemeral: true,
				temporary: true
			};
		}

		return `Successfully removed ${channel} from your highlights.`;
	}

	private static async _clearChannelScoping(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		await prisma.highlightChannelScoping.deleteMany({
			where: {
				user_id: interaction.user.id,
				guild_id: interaction.guild.id
			}
		});

		return "Successfully cleared all channels from your highlights.";
	}

	private static async _eraseHighlights(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		if (!config.hasPermission(interaction.member, Permission.ManageHighlights)) {
			return {
				content: "You do not have permission to manage other users' highlights.",
				ephemeral: true
			};
		}

		const user = interaction.options.getUser("user", true);

		try {
			const [patterns] = await prisma.$transaction([
				prisma.highlightPattern.deleteMany({
					where: {
						user_id: user.id,
						guild_id: interaction.guildId
					}
				}),
				prisma.highlightChannelScoping.deleteMany({
					where: {
						user_id: user.id,
						guild_id: interaction.guildId
					}
				}),
				prisma.highlight.delete({
					where: {
						user_id_guild_id: {
							user_id: user.id,
							guild_id: interaction.guildId
						}
					}
				})
			]);

			return `Successfully erased \`${patterns.count}\` ${pluralize(patterns.count, "highlight")} for ${user}.`;
		} catch {
			return `Failed to erase highlights for ${user}. This user may not have any highlights set up.`;
		}
	}

	private static async _listHighlights(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		let user = interaction.options.getUser("user");

		if (user && user.id !== interaction.user.id) {
			const config = ConfigManager.getGuildConfig(interaction.guildId, true);

			if (!config.hasPermission(interaction.member, Permission.ManageHighlights)) {
				return {
					content: "You do not have permission to view other users' highlights.",
					ephemeral: true
				};
			}
		} else {
			user = interaction.user;
		}

		const highlights = await prisma.highlight.findUnique({
			where: {
				user_id_guild_id: {
					user_id: user.id,
					guild_id: interaction.guild.id
				}
			},
			include: {
				patterns: true,
				channel_scoping: true
			}
		});

		const patternCount = highlights?.patterns.length ?? 0;
		const patterns = highlights?.patterns.map(({ pattern }) => `\`${pattern}\``).join("\n") || "None";

		const [whitelistedChannels, blacklistedChannels] = highlights?.channel_scoping.reduce<[string[], string[]]>((acc, channel) => {
			const index = channel.type === HighlightChannelScopingType.Whitelist ? 0 : 1;
			acc[index].push(`<#${channel.channel_id}>`);
			return acc;
		}, [[], []]) ?? [[], []];

		const embed = new EmbedBuilder()
			.setColor(Colors.Yellow)
			.setAuthor({
				name: `Highlights for ${interaction.guild.name}`,
				iconURL: interaction.guild.iconURL() ?? undefined
			})
			.setFields([
				{
					name: `Patterns (${patternCount}/${PATTERN_LIMIT})`,
					value: patterns
				},
				{
					name: `Whitelisted Channels (${whitelistedChannels.length}/${CHANNEL_LIMIT})`,
					value: whitelistedChannels.join("\n") || "None",
					inline: true
				},
				{
					name: `Blacklisted Channels (${blacklistedChannels.length}/${CHANNEL_LIMIT})`,
					value: blacklistedChannels.join("\n") || "None",
					inline: true
				}
			])
			.setFooter({ text: `@${user.username} • ${user.id}` });

		return { embeds: [embed] };
	}
}

enum HighlightSubcommandGroup {
    Pattern = "pattern",
    Channel = "channel",
}

enum HighlightSubcommand {
    List = "list",
	Erase = "erase"
}

enum HighlightPatternSubcommand {
    Add = "add",
    Remove = "remove",
    Clear = "clear",
}

enum HighlightChannelSubcommand {
    Add = "add",
    Remove = "remove",
    Clear = "clear",
}

export enum HighlightChannelScopingType {
    Whitelist = 0,
    Blacklist = 1,
}