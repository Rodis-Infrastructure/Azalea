import { ApplicationCommandType, MessageContextMenuCommandInteraction } from "discord.js";
import { InteractionResponseType } from "@bot/types/interactions";
import { Command } from "@bot/handlers/interactions/interaction";
import { QuickMuteDuration } from "@bot/types/moderation";
import { handleQuickMute } from "@bot/utils/moderation";

import Config from "@bot/utils/config";

export default class QuickMute30CtxCommand extends Command {
    constructor() {
        super({
            name: "Quick mute (30m)",
            defer: InteractionResponseType.Default,
            type: ApplicationCommandType.Message,
            skipEphemeralCheck: false
        });
    }

    async execute(interaction: MessageContextMenuCommandInteraction<"cached">, _ephemeral: never, config: Config): Promise<void> {
        const { response } = await handleQuickMute({
            message: interaction.targetMessage,
            duration: QuickMuteDuration.Short,
            executorId: interaction.user.id,
            config
        });

        await interaction.reply({
            content: response,
            ephemeral: true
        });
    }
}