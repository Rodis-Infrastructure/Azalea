import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { handleCensorNickname } from "./CensorNickname.ts";
import { InteractionReplyData } from "../utils/types.ts";
import { ConfigManager } from "../utils/config.ts";

import Command from "../handlers/commands/Command.ts";

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