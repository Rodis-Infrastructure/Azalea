import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonComponentData,
    ButtonStyle,
    EmbedBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { RoleRequestNoteAction } from "./RoleRequestNote";

import Component from "@managers/components/Component";

export default class RoleRequestPromptNote extends Component {
    constructor() {
        super("role-request-prompt-note");
    }

    async execute(interaction: ModalSubmitInteraction<"cached">): Promise<InteractionReplyData> {
        const note = interaction.fields.getTextInputValue("note");
        const components = interaction.message!.components;
        const [rawEmbed] = interaction.message!.embeds;

        const embed = new EmbedBuilder(rawEmbed.toJSON())
            .spliceFields(0, 1, {
                name: "Note",
                value: note
            });

        // The last action row will always be the button action row
        const rawButtonActionRow = components[components.length - 1];
        const newComponents: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

        if (components.length === 2) {
            const selectMenuActionRow = new ActionRowBuilder<StringSelectMenuBuilder>(components[0].toJSON());
            newComponents.push(selectMenuActionRow);
        }

        const hasNoteWithSelectMenu = rawButtonActionRow.components.length === 2 && components.length === 2;
        const hasNoteWithoutSelectMenu = rawButtonActionRow.components.length === 3 && components.length === 1;

        // The button action row already contains the necessary buttons
        if (hasNoteWithoutSelectMenu || hasNoteWithSelectMenu) {
            await interaction.message!.edit({ embeds: [embed] });
            return {
                content: "Note updated successfully!",
                ephemeral: true,
                temporary: true
            };
        }

        const editNote = new ButtonBuilder()
            .setCustomId(`role-request-note-${RoleRequestNoteAction.Edit}`)
            .setLabel("Edit note")
            .setStyle(ButtonStyle.Secondary);

        const removeNote = new ButtonBuilder()
            .setCustomId(`role-request-note-${RoleRequestNoteAction.Remove}`)
            .setLabel("Remove note")
            .setStyle(ButtonStyle.Danger);

        const buttonActionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(editNote, removeNote);

        // The request was approved and there is no note
        if (components.length === 1) {
            const rawRemoveRoleButton = rawButtonActionRow.components[1].toJSON() as ButtonComponentData;
            const removeRoleButton = new ButtonBuilder(rawRemoveRoleButton);
            buttonActionRow.addComponents(removeRoleButton);
        }

        newComponents.push(buttonActionRow);

        await interaction.message!.edit({
            embeds: [embed],
            components: newComponents
        });

        return {
            content: "Note updated successfully!",
            ephemeral: true,
            temporary: true
        };
    }
}