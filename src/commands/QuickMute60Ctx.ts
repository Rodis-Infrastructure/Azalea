import { ApplicationCommandType, MessageContextMenuCommandInteraction, PermissionFlagsBits } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { handleQuickMute } from "./QuickMute30Ctx";

import Command from "@managers/commands/Command";
import { MuteDuration } from "@utils/infractions";

export default class QuickMute60Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick mute (1h)",
            type: ApplicationCommandType.Message,
            defaultMemberPermissions: [PermissionFlagsBits.ModerateMembers]
        });
    }

    execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        // Perform a 1-hour quick mute
        return handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: MuteDuration.Long
        });
    }
}