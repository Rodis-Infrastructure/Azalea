import { AutocompleteInteraction, Colors, EmbedBuilder, Events, Interaction } from "discord.js";
import { ConfigManager, GuildConfig, inScope, LoggingEvent } from "../utils/config.ts";
import { ComponentManager } from "../handlers/components/ComponentManager.ts";
import { CommandManager } from "../handlers/commands/CommandManager.ts";
import { InteractionReplyData } from "../utils/types.ts";
import { log } from "../utils/logging.ts";

import EventListener from "../handlers/events/EventListener.ts";
import Sentry from "@sentry/node";

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
            await handleInteraction(interaction, config);
        } catch (error) {
            Sentry.captureException(error, {
                user: {
                    id: interaction.user.id,
                    username: interaction.user.username
                },
                extra: {
                    channel: interaction.channel?.id,
                    guild: interaction.guild.id,
                    command: interaction.isCommand() ? interaction.commandName : interaction.customId
                }
            });

            await interaction.reply({
                content: "An error occurred while executing this interaction.",
                ephemeral: true
            }).catch(() => null);
        } finally {
            await handleInteractionCreateLog(interaction, config);
        }
    }
}

async function handleInteraction(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): Promise<void> {
    const ephemeralReply = interaction.channel
        ? inScope(config.ephemeral_scoping, interaction.channel)
        : true;

    let response: InteractionReplyData | null;

    if (interaction.isCommand()) {
        const command = CommandManager.getCommand(interaction.commandName);
        response = await command?.execute(interaction) ?? null;
    } else {
        const component = ComponentManager.getComponent(interaction.customId);
        response = await component?.execute(interaction) ?? null;
    }

    if (!response) return;

    const defaultReplyOptions = {
        ephemeral: ephemeralReply,
        allowedMentions: { parse: [] }
    };

    if (typeof response === "string") {
        await interaction.reply({
            ...defaultReplyOptions,
            content: response
        });
    } else {
        await interaction.reply({
            ...defaultReplyOptions,
            ...response
        });
    }
}

async function handleInteractionCreateLog(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): Promise<void> {
    if (!interaction.channel) return;

    const interactionName = resolveInteractionName(interaction);
    const embed = new EmbedBuilder()
        .setColor(Colors.Grey)
        .setAuthor({ name: "Interaction Used" })
        .setFields([
            {
                name: "Executor",
                value: `${interaction.user} (\`${interaction.user.id}\`)`,
                inline: true
            },
            {
                name: "Interaction",
                value: `\`${interactionName}\``,
                inline: true
            }
        ])
        .setTimestamp();

    await log({
        event: LoggingEvent.InteractionCreate,
        channel: interaction.channel,
        message: { embeds: [embed] },
        config
    });
}

function resolveInteractionName(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>): string {
    if (interaction.isChatInputCommand()) {
        const subcommand = interaction.options.getSubcommand(false);

        if (subcommand) {
            return `${interaction.commandName} ${subcommand}`;
        }
    }

    if (interaction.isCommand()) {
        return interaction.commandName;
    }

    return interaction.customId;
}