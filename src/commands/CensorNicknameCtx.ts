import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { handleCensorNickname } from "./CensorNickname";
import { InteractionReplyData } from "@utils/types";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

export default class CensorNicknameCtx extends Command<UserContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Censor Nickname",
            type: ApplicationCommandType.User
        });
    }

    execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        return handleCensorNickname(interaction.user.id, interaction.targetMember, config);
    }
}