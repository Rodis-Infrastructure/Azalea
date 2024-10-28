import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonComponentData,
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
import ConfigManager from "@managers/config/ConfigManager";

export default class RoleRequestNote extends Component {
	constructor() {
		super({
			// Format: "role-request-note-{RoleRequestNoteAction}"
			startsWith: "role-request-note"
		});
	}

	async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const [embed] = interaction.message.embeds;

		if (!config.canManageRoleRequest(interaction.member, embed)) {
			return {
				content: "You do not have permission to manage this role request's notes.",
				ephemeral: true,
				temporary: true
			};
		}

		const action = interaction.customId.split("-")[3] as RoleRequestNoteAction;

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

		if (action === RoleRequestNoteAction.Edit) {
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

		// The request have been approved
		if (rawComponents.length === 1) {
			const rawRemoveRoleButton = rawComponents[0].components[2].toJSON() as ButtonComponentData;
			const removeRoleButton = new ButtonBuilder(rawRemoveRoleButton);
			buttonActionRow.addComponents(removeRoleButton);
		}

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