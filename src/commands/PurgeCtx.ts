import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { pluralize } from "@/utils";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";
import Purge from "./Purge";

export default class PurgeCtx extends Command<UserContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Purge messages",
            type: ApplicationCommandType.User
        });
    }

    async execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const member = interaction.targetMember;

        if (!interaction.channel) {
            return Promise.resolve("Failed to get the channel.");
        }

        if (member && member.roles.highest.position! >= interaction.member.roles.highest.position) {
            return Promise.resolve("You cannot purge messages from a user with a higher role than you.");
        }

        const messages = await Purge.purgeUser(
            interaction.targetUser.id,
            interaction.channel,
            config.data.default_purge_amount
        );

        if (!messages.length) {
            return Promise.resolve("No messages were purged.");
        }

        const logURLs = await Purge.log(messages, interaction.channel, config);
        const response = `Purged \`${messages.length}\` ${pluralize(messages.length, "message")} by ${interaction.targetUser}`;

        return `${response}: ${logURLs.join(", ")}`;
    }
}