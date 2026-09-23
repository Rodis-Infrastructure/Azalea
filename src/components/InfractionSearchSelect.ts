import {
	ButtonInteraction,
	CheckboxGroupBuilder,
	CheckboxGroupOptionBuilder,
	ComponentType,
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	ModalSubmitInteraction
} from "discord.js";

import { CommandResponse } from "@utils/types";
import { Permission } from "@managers/config/schema";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";
import Infraction from "@/commands/Infraction";

export default class InfractionSearchSelect extends Component {
	constructor() {
		super({ startsWith: "infraction-search-select" });
	}

	async execute(interaction: ButtonInteraction<"cached"> | ModalSubmitInteraction<"cached">): Promise<CommandResponse> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		if (!config.hasPermission(interaction.member, Permission.ViewInfractions)) {
			return {
				content: "You do not have permission to view infractions.",
				ephemeral: true,
				temporary: true
			};
		}

		if (interaction.customId === "infraction-search-select-open" && interaction.isButton()) {
			await this._showSelectModal(interaction);
			return null;
		}

		if (interaction.customId === "infraction-search-select-submit" && interaction.isModalSubmit()) {
			await this._showSelectedInfractions(interaction);
			return null;
		}

		return {
			content: "Unknown infraction search action.",
			ephemeral: true,
			temporary: true
		};
	}

	private async _showSelectModal(interaction: ButtonInteraction<"cached">): Promise<void> {
		const options = this._getVisibleInfractionOptions(interaction);

		if (!options.length) {
			await interaction.reply({
				content: "No infractions are available to view on this page.",
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const checkboxOptions = options.map(option =>
			new CheckboxGroupOptionBuilder()
				.setLabel(option.label)
				.setValue(option.value)
				.setDescription(option.description)
		);

		const checkboxGroup = new CheckboxGroupBuilder()
			.setCustomId("infractions")
			.setMinValues(1)
			.setMaxValues(options.length)
			.setOptions(checkboxOptions);

		const modal = new ModalBuilder()
			.setCustomId("infraction-search-select-submit")
			.setTitle("Expand Infractions")
			.setLabelComponents(
				new LabelBuilder()
					.setLabel("Infractions")
					.setDescription("Each selection is posted in this channel separately.")
					.setCheckboxGroupComponent(checkboxGroup)
			);

		await interaction.showModal(modal);
	}

	private async _showSelectedInfractions(interaction: ModalSubmitInteraction<"cached">): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const config = ConfigManager.getGuildConfig(interaction.guildId, true);

		const flags = config.channelInScope(interaction.channel) ? MessageFlags.Ephemeral : undefined;

		const selectedInfractionIds = interaction.fields.getField("infractions", ComponentType.CheckboxGroup).values;
		await interaction.editReply(`Showing ${selectedInfractionIds.length} selected infraction(s).`);

		for (const id of selectedInfractionIds) {
			const response = await Infraction.info(parseInt(id), interaction.guildId);
			if (!response) continue;

			const options = typeof response === "string" ? { content: response } : response;
			// eslint-disable-next-line @typescript-eslint/no-unused-vars -- followUp doesn't accept ephemeral/temporary
			const { ephemeral, temporary, ...rest } = options;
			await interaction.followUp({ ...rest, flags });
		}
	}

	private _getVisibleInfractionOptions(interaction: ButtonInteraction<"cached">): InfractionSelectOption[] {
		if (interaction.message.embeds.length === 0) return [];

		const embed = interaction.message.embeds[0];
		return embed.fields.flatMap(field => {
			const id = field.name.match(/#(\d+)/)?.[1];
			if (!id) return [];

			const entries: Record<string, string | undefined> = {};

			for (const line of field.value.split("\n")) {
				const match = line.match(/^> `(.+?)` \| (.+)$/);
				if (!match) continue;

				entries[match[1]] = match[2];
			}

			const created = this._formatTimestamp(entries.Created);
			const duration = entries.Duration ? `Duration: ${entries.Duration}` : null;
			const expires = entries.Expires ? `Expires: ${this._formatTimestamp(entries.Expires)}` : null;
			const reason = entries.Reason ?? entries.Message;
			const descriptionParts = [
				created ? `Created: ${created}` : null,
				duration ?? expires,
				reason ? `Reason: ${reason}` : null
			].filter(Boolean);
			const description = descriptionParts.join(" - ");

			return [{
				label: field.name.length > 100 ? `${field.name.slice(0, 97)}...` : field.name,
				description: description.length > 100 ? `${description.slice(0, 97)}...` : description,
				value: id
			}];
		});
	}

	private _formatTimestamp(value?: string): string | null {
		const timestamp = value?.match(/<t:(\d+):[a-zA-Z]>/)?.[1];

		if (!timestamp) return value ?? null;

		const diff = (parseInt(timestamp) * 1000) - Date.now();
		const units = [
			{ unit: "year", value: 1000 * 60 * 60 * 24 * 365 },
			{ unit: "month", value: 1000 * 60 * 60 * 24 * 30 },
			{ unit: "day", value: 1000 * 60 * 60 * 24 },
			{ unit: "hour", value: 1000 * 60 * 60 },
			{ unit: "minute", value: 1000 * 60 }
		] as const;
		const unit = units.find(currentUnit => Math.abs(diff) >= currentUnit.value);

		if (!unit) return "just now";

		return new Intl.RelativeTimeFormat("en", { numeric: "auto" })
			.format(Math.round(diff / unit.value), unit.unit);
	}
}

type InfractionSelectOption = {
	label: string,
	description: string,
	value: string
};