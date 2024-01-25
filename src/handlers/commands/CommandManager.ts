import Logger from "../../utils/logger.ts";
import Command from "./Command.ts";
import path from "path";
import fs from "fs";

import { BaseError, ensureError, ErrorType } from "../../utils/errors.ts";
import { AbstractInstanceType } from "../../utils/types.ts";
import { CommandInteraction } from "discord.js";
import { client } from "../../index.ts";
import { pluralize } from "../../utils";

export class CommandManager {
    // Class instances of commands mapped by their name
    private static instances = new Map<string, Command<CommandInteraction>>;

    // Create instances of all commands and store them in a map
    static async register(): Promise<void> {
        try {
            const dirpath = path.resolve(import.meta.dir, "../../commands");
            const filenames = fs.readdirSync(dirpath);

            for (const filename of filenames) {
                const filepath = path.resolve(dirpath, filename);

                const commandModule = await import(filepath);
                const commandClass = commandModule.default;
                const command: AbstractInstanceType<typeof Command<CommandInteraction>> = new commandClass();

                this.instances.set(command.data.name, command);
            }
        } catch (_error) {
            const cause = ensureError(_error);

            throw new BaseError("Failed to register commands", {
                name: ErrorType.CommandRegisterError,
                cause
            });
        }

        Logger.info(`Registered ${this.instances.size} ${pluralize(this.instances.size, "command")}`);
    }

    static async publish(): Promise<void> {
        const commands = Array.from(this.instances.values())
            .map(command => command.build());

        if (!commands.length) return;

        const publishedCommands = await client.application?.commands.set(commands);

        if (!publishedCommands) {
            throw new BaseError("Failed to publish commands", {
                name: ErrorType.CommandPublishError
            });
        }

        Logger.info(`Published ${publishedCommands.size} ${pluralize(publishedCommands.size, "command")}`);
    }

    static getCommand(commandName: string): Command<CommandInteraction> | null {
        return this.instances.get(commandName) ?? null;
    }
}