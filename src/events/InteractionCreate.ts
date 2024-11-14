import {
	APIEmbedField,
	AutocompleteInteraction,
	Colors,
	CommandInteractionOption,
	EmbedBuilder,
	Events,
	hyperlink,
	Interaction
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";
import { channelMentionWithName, pluralize, roleMentionWithName, userMentionWithId } from "@/utils";
import { formatMessageContentForShortLog } from "@utils/messages";
import { captureException } from "@sentry/node";

import GuildConfig from "@managers/config/GuildConfig";
import ComponentManager from "@managers/components/ComponentManager";
import CommandManager from "@managers/commands/CommandManager";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class InteractionCreate extends EventListener {
	constructor() {
		super(Events.InteractionCreate);
	}

	async execute(interaction: Interaction): Promise<void> {
		if (interaction.isAutocomplete()) {
			throw new Error(`Autocomplete interactions are not supported`);
		}

		// Only allow interactions in guilds
		if (!interaction.inCachedGuild()) {
			await interaction.reply({
				content: "Interactions are not supported in DMs.",
				ephemeral: true
			});
			return;
		}

		const config = ConfigManager.getGuildConfig(interaction.guildId);

		if (!config) {
			await interaction.reply({
				content: "This guild does not have a configuration set up.",
				ephemeral: true
			});
			return;
		}

		try {
			await InteractionCreate._handle(interaction, config);
		} catch (error) {
			const sentryId = captureException(error, {
				user: {
					id: interaction.user.id,
					username: interaction.user.username
				},
				extra: {
					channel: interaction.channel?.id,
					guild: interaction.guild.id,
					command: InteractionCreate._parseInteractionName(interaction)
				}
			});

			await interaction.reply({
				content: `An error occurred while executing this interaction (\`${sentryId}\`)`,
				ephemeral: true
			}).catch(() => null);

			return;
		}

		InteractionCreate._log(interaction, config);
	}

	private static async _handle(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): Promise<void> {
		const ephemeralReply = interaction.channel
			? config.channelInScope(interaction.channel)
			: true;

		let response: InteractionReplyData | null;

		if (interaction.isCommand()) {
			response = await CommandManager.handleCommand(interaction);
		} else {
			response = await ComponentManager.handle(interaction);
		}

		// The interaction's response was handled manually
		if (!response) {
			return;
		}

		const defaultReplyOptions = {
			ephemeral: ephemeralReply,
			allowedMentions: { parse: [] }
		};

		const options = typeof response === "string"
			? { content: response }
			: response;

		const isTemporary = options.temporary;
		delete options.temporary;

		if (interaction.deferred) {
			await interaction.editReply({
				...defaultReplyOptions,
				...options
			});
		} else {
			await interaction.reply({
				...defaultReplyOptions,
				...options
			});
		}

		if (isTemporary && ephemeralReply) {
			setTimeout(() => {
				interaction.deleteReply().catch(() => null);
			}, config.data.response_ttl);
		}
	}

	private static async _log(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): Promise<void> {
		if (!interaction.channel) return;

		const interactionName = InteractionCreate._parseInteractionName(interaction);
		const [interactionType, interactionOptionsEmbed] = await InteractionCreate._parseInteractionOptions(interaction);
		const embeds = [];

		const embed = new EmbedBuilder()
			.setColor(Colors.Grey)
			.setAuthor({ name: `${interactionType} Used` })
			.setFields([
				{
					name: "Executor",
					value: `${interaction.user} (\`${interaction.user.id}\`)`
				},
				{
					name: "Interaction Name",
					value: `\`${interactionName}\``
				},
				{
					name: "Channel",
					value: channelMentionWithName(interaction.channel)
				}
			]);

		embeds.push(embed);

		// Add a timestamp to the last embed in the array
		if (!interactionOptionsEmbed) {
			embed.setTimestamp();
		} else {
			embeds.push(interactionOptionsEmbed);
		}

		log({
			event: LoggingEvent.InteractionCreate,
			channel: interaction.channel,
			message: { embeds },
			member: interaction.member,
			config
		});
	}

	private static async _parseInteractionOptions(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>): Promise<[string, EmbedBuilder | null]> {
		let interactionType = "Interaction";

		const embed = new EmbedBuilder()
			.setColor(Colors.NotQuiteBlack)
			.setAuthor({ name: "Options" })
			.setTimestamp();

		if (interaction.isChatInputCommand()) {
			interactionType = "Slash Command";
			const mappedOptions = await InteractionCreate._parseChatInputCommandOptions(interaction.options.data);
			embed.setFields(mappedOptions);
		}

		if (interaction.isModalSubmit()) {
			interactionType = "Modal";

			const mappedOptions: Promise<APIEmbedField>[] = interaction.fields.fields.map(async field => {
				const content = await formatMessageContentForShortLog(field.value, null, null);
				return {
					name: field.customId,
					value: content
				};
			});

			embed.setFields(await Promise.all(mappedOptions));
		}

		if (interaction.isUserContextMenuCommand()) {
			interactionType = "User Context Menu";
			embed.setFields({
				name: "Target User",
				value: userMentionWithId(interaction.targetId)
			});
		}

		if (interaction.isMessageContextMenuCommand()) {
			interactionType = "Message Context Menu";

			const { url, content } = interaction.targetMessage;
			const stickerId = interaction.targetMessage.stickers.first()?.id ?? null;
			const formattedContent = await formatMessageContentForShortLog(content, stickerId, url);

			embed.setFields([
				{
					name: "Target User",
					value: userMentionWithId(interaction.targetMessage.author.id)
				},
				{
					name: "Source Channel",
					value: channelMentionWithName(interaction.targetMessage.channel)
				},
				{
					name: "Target Message",
					value: formattedContent
				}
			]);
		}

		if (interaction.isButton()) {
			interactionType = "Button";
			embed.setFields({
				name: "Message",
				value: hyperlink("Jump to message", interaction.message.url)
			});
		}

		if (interaction.isAnySelectMenu()) {
			interactionType = "Select Menu";

			let values: string[] = [];

			// User / Mentionable select menu
			if ("users" in interaction) {
				const users = interaction.users.mapValues(user => `- ${user}`);
				values = values.concat(Array.from(users.values()));
			}

			// Role / Mentionable select menu
			if ("roles" in interaction) {
				const roles = interaction.roles.mapValues(role => `- ${role}`);
				values = values.concat(Array.from(roles.values()));
			}

			// Channel select menu
			if ("channels" in interaction) {
				const channels = interaction.channels.mapValues(channel => `- ${channel}`);
				values = values.concat(Array.from(channels.values()));
			}

			if (interaction.isStringSelectMenu()) {
				values = interaction.values.map(value => `- \`${value}\``);
			}

			embed.setFields({
				name: `Selected ${pluralize(interaction.values.length, "Value")}`,
				value: values.join("\n") || "None"
			});
		}

		if (embed.data.fields?.length) {
			return [interactionType, embed];
		} else {
			return [interactionType, null];
		}
	}

	private static async _parseChatInputCommandOptions(options: readonly CommandInteractionOption<"cached">[]): Promise<APIEmbedField[]> {
		let fields: APIEmbedField[] = [];

		for (const option of options) {
			if ("options" in option && option.options) {
				const nestedOptions = await InteractionCreate._parseChatInputCommandOptions(option.options);
				fields = fields.concat(nestedOptions);
			} else if (option.channel) {
				fields.push({
					name: option.name,
					value: channelMentionWithName(option.channel)
				});
			} else if (option.user) {
				fields.push({
					name: option.name,
					value: userMentionWithId(option.user.id)
				});
			} else if (option.role) {
				fields.push({
					name: option.name,
					value: roleMentionWithName(option.role)
				});
			} else if (!option.attachment && option.value) {
				const formattedValue = await formatMessageContentForShortLog(option.value.toString(), null, null);
				fields.push({
					name: option.name,
					value: formattedValue
				});
			}
		}

		return fields;
	}

	/** @returns The interaction's name or custom ID */
	private static _parseInteractionName(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>): string {
		if (interaction.isChatInputCommand()) {
			const subcommandGroup = interaction.options.getSubcommandGroup(false);
			const subcommand = interaction.options.getSubcommand(false);
			const command = `/${interaction.commandName}`;

			return [command, subcommandGroup, subcommand]
				.filter(Boolean)
				.join(" ");
		}

		if (interaction.isContextMenuCommand()) {
			return interaction.commandName;
		}

		return ComponentManager.parseCustomId(interaction.customId);
	}
}