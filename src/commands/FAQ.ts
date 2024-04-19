import { ChatInputCommandInteraction } from "discord.js";
import { InteractionReplyData } from "@utils/types";

import GuildCommand from "@managers/commands/GuildCommand";
import GuildConfig from "@managers/config/GuildConfig";

export default class FAQ extends GuildCommand<ChatInputCommandInteraction<"cached">> {
    constructor(config: GuildConfig) {
        super(config, {
            name: "faq",
            description: "Use quick responses"
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        return "Temp";
    }
}