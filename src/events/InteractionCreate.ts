import { AutocompleteInteraction, Colors, EmbedBuilder, Events, Interaction } from "discord.js";
import { ConfigManager, GuildConfig, LoggingEvent } from "../utils/config.ts";
import { ComponentManager } from "../handlers/components/ComponentManager.ts";
import { ensureError, InteractionExecuteError } from "../utils/errors.ts";
import { CommandManager } from "../handlers/commands/CommandManager.ts";

import EventListener from "../handlers/events/EventListener.ts";
import { log } from "../utils/logging.ts";

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
            if (interaction.isCommand()) {
                await CommandManager.handle(interaction);
                return;
            }

            if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
                await ComponentManager.handle(interaction);
                return;
            }
        } catch (_error) {
            const cause = ensureError(_error);

            await interaction.reply({
                content: "An error occurred while executing this interaction.",
                ephemeral: true
            }).catch(() => null);

            throw new InteractionExecuteError(interaction, cause);
        }

        await handleInteractionCreateLog(interaction, config);
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
        member: interaction.member,
        channel: interaction.channel,
        embeds: [embed],
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