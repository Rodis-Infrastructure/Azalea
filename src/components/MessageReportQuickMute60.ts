import { handleMessageReportQuickMute } from "./MessageReportQuickMute30";
import { ONE_HOUR } from "@/commands/QuickMute60Ctx";
import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";

import Component from "@managers/components/Component";

export default class MessageReportQuickMute60 extends Component {
    constructor() {
        super("message_report_qm60");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleMessageReportQuickMute(interaction, ONE_HOUR);
    }
}