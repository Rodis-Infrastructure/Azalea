import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { handlePurgeLog, purgeUser } from "./Purge";
import { pluralize } from "@/utils";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

export default class PurgeCtx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Purge Messages",
            type: ApplicationCommandType.Message
        });
    }

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const target = interaction.targetMessage.member;

        if (!interaction.channel) {
            return Promise.resolve("Failed to get the channel.");
        }

        if (target && target.roles.highest.position! >= interaction.member.roles.highest.position) {
            return Promise.resolve("You cannot purge messages from a user with a higher role than you.");
        }

        const messages = await purgeUser(
            interaction.targetMessage.author.id,
            interaction.channel,
            config.data.default_purge_amount
        );

        if (!messages.length) {
            return Promise.resolve("No messages were purged.");
        }


        const logURLs = await handlePurgeLog(messages, interaction.channel, config);
        const response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${interaction.targetMessage.author}`;

        return `${response}: ${logURLs.join(", ")}`;
    }
}