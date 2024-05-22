import { ActionRowBuilder, ButtonBuilder, ButtonComponent, ButtonInteraction, ButtonStyle } from "discord.js";
import { getFilePreviewUrl } from "@/utils";
import { InteractionReplyData } from "@utils/types";

import Component from "@managers/components/Component";

export default class MessageBulkDeleteRefreshUrl extends Component {
    constructor() {
        super("message-delete-bulk-refresh-url");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const newUrl = interaction.message.attachments.first()!.url;
        const previewUrl = getFilePreviewUrl(newUrl);

        const openInBrowserButton = new ButtonBuilder()
            .setLabel("Open in Browser")
            .setStyle(ButtonStyle.Link)
            .setURL(previewUrl);

        const rawRefreshUrlButton = interaction.message.components[0].components[0] as ButtonComponent;
        const refreshUrlButton = new ButtonBuilder(rawRefreshUrlButton.toJSON());

        const newActionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(refreshUrlButton, openInBrowserButton);

        await interaction.update({ components: [newActionRow] });
        return null;
    }
}