import { handleMessageReportQuickMute } from "./MessageReportQuickMute30";
import { InteractionReplyData, MuteDuration } from "@utils/types";
import { ButtonInteraction } from "discord.js";

import Component from "@managers/components/Component";

export default class MessageReportQuickMute60 extends Component {
    constructor() {
        super("message-report-qm60");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        return handleMessageReportQuickMute(interaction, MuteDuration.Long);
    }
}