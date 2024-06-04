import { ApplicationCommandData, CommandInteraction } from "discord.js";

import Command from "./Command";
import GuildConfig from "@managers/config/GuildConfig";

export default abstract class GuildCommand<T extends CommandInteraction> extends Command<T> {
    /**
     * @param config - The guild's configuration
     * @param data The data for the command.
     * @protected
     */
    protected constructor(public readonly config: GuildConfig, public data: ApplicationCommandData) {
        super(data);
    }
}