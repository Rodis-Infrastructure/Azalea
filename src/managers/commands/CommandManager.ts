import { Collection, CommandInteraction, Snowflake } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { pluralize } from "@/utils";
import { client } from "@/index";
import { captureException } from "@sentry/node";

import Logger, { AnsiColor } from "@utils/logger";
import Command from "./Command";
import path from "path";
import fs from "fs";
import GuildCommand from "./GuildCommand";
import ConfigManager from "@managers/config/ConfigManager";

// Utility class for handling command interactions.
export default class CommandManager {
	// Cached global commands mapped by their names.
	private static readonly _globalCommands = new Collection<string, Command<CommandInteraction>>();
	// Cached guild commands mapped by their guild's ID.
	private static readonly _guildCommands = new Collection<Snowflake, Collection<string, GuildCommand<CommandInteraction>>>();

	// Caches all commands from the commands directory.
	static async cache(): Promise<void> {
		const dirpath = path.resolve("src/commands");

		if (!fs.existsSync(dirpath)) {
			Logger.info("Skipping command caching: commands directory not found");
			return;
		}

		Logger.info("Caching commands...");

		const filenames = fs.readdirSync(dirpath);
		let commandCount = 0;

		const guilds = await client.guilds.fetch();
		const guildIds = guilds.map(guild => guild.id);

		for (const filename of filenames) {
			const filepath = path.resolve(dirpath, filename);

			// Import and initiate the command
			const commandModule = await import(filepath).catch(captureException);
			if (!commandModule) continue;

			const commandClass = commandModule.default;
			// Ensure the command is an instance of the Command class
			if (!(commandClass.prototype instanceof Command)) continue;

			let logMessage: string;
			let level: string;

			if (commandClass.prototype instanceof GuildCommand) {
				const commandName = CommandManager._cacheGuildCommand(guildIds, commandClass);

				logMessage = `Cached guild command "${commandName}"`;
				level = "GUILD";
			} else {
				const command = new commandClass();
				CommandManager._globalCommands.set(command.data.name, command);

				logMessage = `Cached global command "${command.data.name}"`;
				level = "GLOBAL";
			}

			Logger.log(level, logMessage, {
				color: AnsiColor.Purple
			});

			commandCount++;
		}

		Logger.info(`Cached ${commandCount} global ${pluralize(commandCount, "command")}`);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static _cacheGuildCommand(guildIds: Snowflake[], commandClass: any): string {
		let commandName: string | null = null;

		for (const guildId of guildIds) {
			const config = ConfigManager.getGuildConfig(guildId);
			if (!config) continue;

			const command = new commandClass(config);
			commandName ??= command.data.name;

			const guildCommands = CommandManager._guildCommands.get(guildId);

			if (guildCommands) {
				guildCommands.set(command.data.name, command);
			} else {
				const entry = [command.data.name, command] as const;
				const guildCommands = new Collection([entry]);

				CommandManager._guildCommands.set(guildId, guildCommands);
			}
		}

		return commandName ?? "unknown";
	}

	// Publish all cached commands to Discord.
	static async publish(): Promise<void> {
		Logger.info("Publishing commands...");

		const logMessage = (commandCount: number): string => `Published ${commandCount} ${pluralize(commandCount, "command")}`;

		// Publish guild commands
		for (const [guildId, guildCommands] of CommandManager._guildCommands) {
			const guild = await client.guilds.fetch(guildId);

			// Retrieve all cached guild commands and build them
			const commands = guildCommands.map(command => command.build());
			const publishedCommands = await guild.commands.set(commands).catch(() => null);

			if (!publishedCommands) {
				captureException(new Error("Failed to publish guild commands"));
				return;
			}

			Logger.log(`GUILD: ${guildId}`, logMessage(publishedCommands.size), {
				color: AnsiColor.Purple
			});
		}

		// Publish global commands
		// Retrieve all cached global commands and build them
		const globalCommands = CommandManager._globalCommands.map(command => command.build());

		// No commands to publish
		if (!globalCommands.length) return;

		const publishedCommands = await client.application.commands.set(globalCommands).catch(() => null);

		if (!publishedCommands) {
			captureException(new Error("Failed to publish global commands"));
			return;
		}

		Logger.log("GLOBAL", logMessage(publishedCommands.size), {
			color: AnsiColor.Purple
		});

		Logger.info("Finished publishing commands");
	}

	// Handles a command interaction.
	static handleCommand(interaction: CommandInteraction): Promise<InteractionReplyData> | InteractionReplyData {
		const command = CommandManager._get(
			interaction.commandId,
			interaction.commandName,
			interaction.guildId
		);

		if (!command) {
			throw new Error(`Command "${interaction.commandName}" not found`);
		}

		return command.execute(interaction);
	}

	/**
     * Retrieves a command by its name.
     *
     * @param commandId The command's ID.
     * @param commandName The command's name.
     * @param guildId The source guild's ID.
     * @private
     */
	private static _get(
		commandId: Snowflake,
		commandName: string,
		guildId: Snowflake | null
	): Command<CommandInteraction> | undefined {
		// The command manager [application.commands] only contains global commands
		const isGlobalCommand = client.application.commands.cache.has(commandId);

		if (isGlobalCommand) {
			return CommandManager._globalCommands.get(commandName);
		}

		if (!guildId) return;

		const guildCommands = CommandManager._guildCommands.get(guildId);
		return guildCommands?.get(commandName);
	}
}