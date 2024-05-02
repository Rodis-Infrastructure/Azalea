import { handleMessageReportQuickMute } from "./MessageReportQuickMute30";
import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction } from "discord.js";

import Component from "@managers/components/Component";
import MessageReportResolve from "./MessageReportResolve";
import { MuteDuration } from "@utils/infractions";

export default class MessageReportQuickMute60 extends Component {
    constructor() {
        super("message-report-qm60");
    }

    execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        MessageReportResolve.log(interaction, "quick mute (60m)");
        return handleMessageReportQuickMute(interaction, MuteDuration.Long);
    }
}