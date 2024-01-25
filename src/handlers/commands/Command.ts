import { ApplicationCommandData, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { InteractionReplyData } from "../../utils/types.ts";

export default abstract class Command<T extends CommandInteraction> {
    protected constructor(public data: ApplicationCommandData) {}

    abstract execute(interaction: T): Promise<InteractionReplyData> | InteractionReplyData;

    build(): ApplicationCommandData {
        return {
            defaultMemberPermissions: [PermissionFlagsBits.ManageGuild],
            ...this.data,
            dmPermission: false
        };
    }
}