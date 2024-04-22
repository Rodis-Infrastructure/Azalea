import { ApplicationCommandType, UserContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import CensorNickname from "./CensorNickname";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

/**
 * Censors a member's nickname by changing it to "Unverified User XXXXX".
 * The following requirements must be met for the command to be successful:
 *
 * 1. The target member must be in the server.
 * 2. The target member must not have any roles.
 * 3. The target member must be manageable by the bot.
 *
 * Upon changing the nickname, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs
 */
export default class CensorNicknameCtx extends Command<UserContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Censor Nickname",
            type: ApplicationCommandType.User
        });
    }

    execute(interaction: UserContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        return CensorNickname.handle(interaction.user.id, interaction.targetMember, config);
    }
}