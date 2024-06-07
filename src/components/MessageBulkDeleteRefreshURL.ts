import { ActionRowBuilder, ButtonBuilder, ButtonComponent, ButtonInteraction, ButtonStyle } from "discord.js";
import { getFilePreviewURL } from "@/utils";
import { InteractionReplyData } from "@utils/types";

import Component from "@managers/components/Component";

export default class MessageBulkDeleteRefreshURL extends Component {
    constructor() {
        super("message-delete-bulk-refresh-url");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const newURL = interaction.message.attachments.first()!.url;
        const previewURL = getFilePreviewURL(newURL);

        const openInBrowserButton = new ButtonBuilder()
            .setLabel("Open in Browser")
            .setStyle(ButtonStyle.Link)
            .setURL(previewURL);

        const rawRefreshURLButton = interaction.message.components[0].components[0] as ButtonComponent;
        const refreshURLButton = new ButtonBuilder(rawRefreshURLButton.toJSON());

        const newActionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(refreshURLButton, openInBrowserButton);

        await interaction.update({ components: [newActionRow] });
        return null;
    }
}