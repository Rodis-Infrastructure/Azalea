import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";
import { client } from "./..";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";
import UserInfoCommand from "@/commands/UserInfo";

export default class UserInfo extends Component {
    constructor() {
        // Format: "user-info-{targetId}"
        super({ startsWith: "user-info" });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const targetId = interaction.customId.split("-")[2];

        if (!targetId) {
            return "Failed to get the target user's ID.";
        }

        const member = await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        const user = member?.user ?? await client.users
            .fetch(targetId)
            .catch(() => null);

        if (!user) {
            return "Failed to fetch the target user.";
        }

        return UserInfoCommand.get({
            executor: interaction.member,
            channel: interaction.channel,
            config,
            member,
            user
        });
    }
}