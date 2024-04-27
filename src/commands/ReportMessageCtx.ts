import { ApplicationCommandType, MessageContextMenuCommandInteraction, PermissionFlagsBits } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";
import MessageReactionAdd from "@/events/MessageReactionAdd";
import ConfigManager from "@managers/config/ConfigManager";

export default class ReportMessageCtx extends Command<MessageContextMenuCommandInteraction> {
    constructor() {
        super({
            name: "Report message",
            type: ApplicationCommandType.Message,
            defaultMemberPermissions: [PermissionFlagsBits.AddReactions]
        });
    }

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const user = interaction.targetMessage.author;
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (user.bot) {
            return Promise.resolve("You cannot report bots");
        }

        await MessageReactionAdd.createMessageReport(user.id, interaction.targetMessage, config);
        return Promise.resolve(`Successfully reported ${user}, thank you for your report!`);
    }
}