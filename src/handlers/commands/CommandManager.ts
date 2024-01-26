import Logger from "../../utils/logger.ts";
import Command from "./Command.ts";
import path from "path";
import fs from "fs";

import { AbstractInstanceType } from "../../utils/types.ts";
import { ApplicationCommandData, CommandInteraction } from "discord.js";
import { client } from "../../index.ts";
import { pluralize } from "../../utils";

export class CommandManager {
    // Class instances of commands mapped by their name
    private static instances = new Map<string, Command<CommandInteraction>>;

    // Create instances of all commands and store them in a map
    static async register(): Promise<void> {
        const dirpath = path.resolve(import.meta.dir, "../../commands");
        const filenames = fs.readdirSync(dirpath);

        for (const filename of filenames) {
            const filepath = path.resolve(dirpath, filename);

            const commandModule = await import(filepath);
            const commandClass = commandModule.default;
            const command: AbstractInstanceType<typeof Command<CommandInteraction>> = new commandClass();

            this.instances.set(command.data.name, command);
        }

        Logger.info(`Registered ${this.instances.size} ${pluralize(this.instances.size, "command")}`);
    }

    static async publish(): Promise<void> {
        const builtCommands: ApplicationCommandData[] = [];

        for (const command of this.instances.values()) {
            const builtCommand = command.build();
            builtCommands.push(builtCommand);
        }

        const publishedCommands = await client.application.commands.set(builtCommands);

        Logger.info(`Published ${publishedCommands.size} ${pluralize(publishedCommands.size, "command")}`);
    }

    static getCommand(commandName: string): Command<CommandInteraction> | null {
        return this.instances.get(commandName) ?? null;
    }
}