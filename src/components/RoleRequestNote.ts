import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import Component from "@managers/components/Component";

export default class RoleRequestNote extends Component {
    constructor() {
        super({
            // Format: "role-request-note-{RoleRequestNoteAction}"
            startsWith: "role-request-note"
        });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const action = interaction.customId.split("-")[3] as RoleRequestNoteAction;

        // Remove the note from the embed
        if (action === RoleRequestNoteAction.Remove) {
            await RoleRequestNote._removeNote(interaction);
            return null;
        }

        const noteInput = new TextInputBuilder()
            .setCustomId("note")
            .setLabel("Note")
            .setPlaceholder("Enter note...")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(EMBED_FIELD_CHAR_LIMIT)
            .setRequired(true);

        // Get the value of the last field in the embed
        // and use it as the value
        if (action === RoleRequestNoteAction.Edit) {
            const [embed] = interaction.message.embeds;
            const note = embed.fields.slice(-1)[0].value;

            noteInput.setValue(note);
        }

        const inputActionRow = new ActionRowBuilder<TextInputBuilder>()
            .setComponents(noteInput);

        const modal = new ModalBuilder()
            .setCustomId("role-request-prompt-note")
            .setTitle("Add a note")
            .setComponents(inputActionRow);

        await interaction.showModal(modal);
        return null;
    }

    private static async _removeNote(interaction: ButtonInteraction<"cached">): Promise<void> {
        const [rawEmbed] = interaction.message.embeds;

        const rawComponents = interaction.message.components;
        const components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = [];

        // If the select menu is present, add it back to the components
        if (rawComponents.length === 2) {
            const selectMenuActionRow = new ActionRowBuilder<StringSelectMenuBuilder>(
                rawComponents[0].toJSON()
            );

            components.push(selectMenuActionRow);
        }

        // Remove all fields from the embed
        const embed = new EmbedBuilder(rawEmbed.toJSON())
            .setFields();

        const addNote = new ButtonBuilder()
            .setCustomId(`role-request-note-${RoleRequestNoteAction.Add}`)
            .setLabel("Add note")
            .setStyle(ButtonStyle.Secondary);

        const buttonActionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(addNote);

        components.push(buttonActionRow);

        await interaction.update({
            embeds: [embed],
            components
        });
    }
}

export enum RoleRequestNoteAction {
    Add = "add",
    Edit = "edit",
    Remove = "remove"
}