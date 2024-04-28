import { AutocompleteInteraction, Colors, EmbedBuilder, Events, Interaction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
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
            await InteractionCreate._handle(interaction, config);
        } catch (error) {
            const sentryId = Sentry.captureException(error, {
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
                content: `An error occurred while executing this interaction (\`${sentryId}\`)`,
                ephemeral: true
            }).catch(() => null);
        } finally {
            InteractionCreate._log(interaction, config);
        }
    }

    private static async _handle(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): Promise<void> {
        const ephemeralReply = interaction.channel
            ? config.inScope(interaction.channel, config.data.ephemeral_scoping)
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

    private static _log(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>, config: GuildConfig): void {
        if (!interaction.channel) return;

        const interactionName = InteractionCreate._parseInteractionName(interaction);
        const embed = new EmbedBuilder()
            .setColor(Colors.Grey)
            .setAuthor({ name: "Interaction Used" })
            .setFields([
                {
                    name: "Executor",
                    value: `${interaction.user} (\`${interaction.user.id}\`)`
                },
                {
                    name: "Interaction",
                    value: `\`${interactionName}\``
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

    // @returns The interaction's name or custom ID
    private static _parseInteractionName(interaction: Exclude<Interaction<"cached">, AutocompleteInteraction>): string {
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