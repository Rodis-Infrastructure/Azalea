import { ApplicationCommandOptionType, ChatInputCommandInteraction } from "discord.js";
import { InfractionAction, InfractionManager, InfractionUtil } from "@utils/infractions";
import { InteractionReplyData } from "@utils/types";
import { EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";

import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

/**
 * Warn the user. Upon warning, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs and store the infraction in the database
 */
export default class Warn extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "warn",
			description: "Warns the user",
			options: [
				{
					name: "user",
					description: "The user to warn",
					type: ApplicationCommandOptionType.User,
					required: true
				},
				{
					name: "reason",
					description: "The reason of the warn",
					type: ApplicationCommandOptionType.String,
					maxLength: EMBED_FIELD_CHAR_LIMIT,
					required: true
				}
			]
		});
	}

	async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const reason = interaction.options.getString("reason", true);
		const member = interaction.options.getMember("user");
		const validationResult = await InfractionUtil.validateReason(reason, config);

		if (!validationResult.ok) {
			return {
				content: validationResult.message,
				temporary: true
			};
		}

		if (member && member.roles.highest.position >= interaction.member.roles.highest.position) {
			return {
				content: "You cannot warn a user with a higher or equal role",
				temporary: true
			};
		}

		const user = member?.user ?? interaction.options.getUser("user", true);
		const infraction = await InfractionManager.storeInfraction({
			executor_id: interaction.user.id,
			guild_id: interaction.guildId,
			action: InfractionAction.Warn,
			target_id: user.id,
			reason: reason
		});

		InfractionManager.logInfraction(infraction, interaction.member, config);

		const formattedReason = InfractionUtil.formatReason(reason);
		const message = `warned ${user} - \`#${infraction.id}\` ${formattedReason}`;

		if (interaction.channel && config.channelInScope(interaction.channel)) {
			config.sendNotification(`${interaction.user} ${message}`, false);
		}

		const infractionCountMessage = await InfractionManager.getInfractionCountMessage(user.id, interaction.guildId);

		return {
			content: `Successfully ${message}${infractionCountMessage}`,
			temporary: true
		};
	}
}