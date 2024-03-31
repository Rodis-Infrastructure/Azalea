import { AutocompleteInteraction, Colors, EmbedBuilder, Events, Interaction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { log } from "@utils/logging";

import GuildConfig, { LoggingEvent } from "@managers/config/GuildConfig";
import ComponentManager from "@managers/components/ComponentManager";
import CommandManager from "@managers/commands/CommandManager";
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
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
            await this.handleInteraction(interaction, config);
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
            this.handleInteractionCreateLog(interaction, config);
        }
    }

    async handleInteraction(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): Promise<void> {
        const ephemeralReply = interaction.channel
            ? config.inLoggingScope(interaction.channel)
            : true;

        let response: InteractionReplyData | null;

        if (interaction.isCommand()) {
            response = await CommandManager.handleCommand(interaction);
        } else {
            response = await ComponentManager.handle(interaction);
        }

        if (!response) {
            await interaction.reply({
                content: "Failed to fetch the interaction's response.",
                ephemeral: true
            });

            return;
        }

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

    handleInteractionCreateLog(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): void {
        if (!interaction.channel) return;

        const interactionName = this.parseInteractionName(interaction);
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

        log({
            event: LoggingEvent.InteractionCreate,
            channel: interaction.channel,
            message: { embeds: [embed] },
            config
        });
    }

    /** @returns The interaction's name or custom ID */
    parseInteractionName(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>): string {
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
}