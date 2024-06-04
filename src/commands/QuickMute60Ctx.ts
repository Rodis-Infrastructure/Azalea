import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { handleQuickMute } from "./QuickMute30Ctx";
import { MuteDuration } from "@utils/infractions";

import Command from "@managers/commands/Command";

export default class QuickMute60Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick mute (1h)",
            type: ApplicationCommandType.Message
        });
    }

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        // Perform a 1-hour quick mute
        const { message } = await handleQuickMute({
            executor: interaction.member,
            targetMessage: interaction.targetMessage,
            duration: MuteDuration.Long
        });

        return message;
    }
}