import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { InteractionReplyData } from "../utils/types.ts";
import { handleQuickMute } from "./QuickMute30Ctx.ts";

import Command from "../handlers/commands/Command.ts";

// Constants
const ONE_HOUR = 1000 * 60 * 60;

export default class QuickMute60Ctx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Quick Mute (1h)",
            type: ApplicationCommandType.Message
        });
    }

    execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        return handleQuickMute(interaction, ONE_HOUR);
    }
}