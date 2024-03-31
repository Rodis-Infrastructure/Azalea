import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { handleQuickMute } from "./QuickMute30Ctx";

import Command from "@managers/commands/Command";

// Constants
export const ONE_HOUR = 1000 * 60 * 60;

export default class QuickMute60Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick Mute (1h)",
            type: ApplicationCommandType.Message
        });
    }

    execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        // Perform a 1-hour quick mute
        return handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: ONE_HOUR
        });
    }
}