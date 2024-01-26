import { ApplicationCommandType, Attachment, MessageContextMenuCommandInteraction } from "discord.js";
import { ConfigManager, LoggingEvent } from "../utils/config.ts";
import { InteractionReplyData } from "../utils/types.ts";
import { log } from "../utils/logging.ts";
import { pluralize } from "../utils";

import Command from "../handlers/commands/Command.ts";

export default class StoreMediaCtx extends Command<MessageContextMenuCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "Store Media",
            type: ApplicationCommandType.Message
        });
    }

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const files: Attachment[] = Array.from(interaction.targetMessage.attachments.values());

        if (!files.length) {
            return "This message doesn't have any attachments.";
        }

        const loggedMessages = await log({
            event: LoggingEvent.MediaStore,
            message: {
                content: `Media from ${interaction.targetMessage.member}, stored by ${interaction.user}`,
                allowedMentions: { parse: [] },
                files
            },
            channel: null,
            config
        });

        if (!loggedMessages?.length) {
            return "Failed to store media.";
        }

        const logURLs = loggedMessages.map(message => message.url);

        return `Stored \`${files.length}\` ${pluralize(files.length, "attachment")} from ${interaction.targetMessage.member} - ${logURLs.join(" ")}`;
    }
}