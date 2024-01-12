import { ApplicationCommandData, CommandInteraction, PermissionFlagsBits } from "discord.js";

export default abstract class Command<T extends CommandInteraction> {
    protected constructor(public data: ApplicationCommandData) {}

    abstract execute(interaction: T): Promise<void> | void;

    build(): ApplicationCommandData {
        return {
            defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
            ...this.data,
            dmPermission: false
        };
    }
}