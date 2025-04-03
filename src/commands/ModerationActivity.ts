import {
	ActionRowBuilder,
	ApplicationCommandOptionChoiceData,
	ApplicationCommandOptionType,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	Snowflake
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { InfractionAction, InfractionFlag } from "@utils/infractions";
import { BanRequest, Infraction, MuteRequest } from "@prisma/client";
import { capitalize } from "lodash";
import { DEFAULT_EMBED_COLOR } from "@utils/constants";
import { MuteRequestStatus } from "@utils/muteRequests";
import { BanRequestStatus } from "@utils/banRequests";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";

const CURRENT_YEAR = new Date().getFullYear();

// Months of the year mapped by their names as labels and positions as values
const months: ApplicationCommandOptionChoiceData<number>[] = Array.from({ length: 12 }, (_, i) => {
	const date = new Date(0, i);
	const month = date.toLocaleString(undefined, { month: "long" });

	return { name: month, value: i + 1 };
});

export default class Moderation extends Command<ChatInputCommandInteraction<"cached">> {
	constructor() {
		super({
			name: "moderation",
			description: "Get the moderation activity of a user",
			options: [{
				name: "activity",
				description: "Get the moderation activity of a user",
				type: ApplicationCommandOptionType.Subcommand,
				options: [
					{
						name: "user",
						description: "The user to get the moderation activity of",
						type: ApplicationCommandOptionType.User,
						required: true
					},
					{
						name: "month",
						description: "The month to get the moderation activity of",
						type: ApplicationCommandOptionType.Integer,
						choices: months
					},
					{
						name: "year",
						description: "The year to get the moderation activity of",
						type: ApplicationCommandOptionType.Integer,
						// The year Discord was created
						min_value: 2015,
						max_value: CURRENT_YEAR
					}
				]
			}]
		});
	}

	async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
		const month = interaction.options.getInteger("month");
		const year = interaction.options.getInteger("year");
		const user = interaction.options.getUser("user", true);
		const config = ConfigManager.getGuildConfig(interaction.guildId, true);
		const data = await Moderation._getActivity(user.id, interaction.guildId, { month, year });

		const embed = new EmbedBuilder()
			.setColor(DEFAULT_EMBED_COLOR)
			.setAuthor({
				name: `Moderation activity of @${user.username}`,
				iconURL: user.displayAvatarURL()
			})
			.setFields([
				{
					name: "Notes",
					value: data.executed.notes.toString(),
					inline: true
				},
				{
					name: "Warns",
					value: data.executed.warns.toString(),
					inline: true
				},
				{
					name: "Manual Mutes",
					value: data.executed.manualMutes.toString(),
					inline: true
				},
				{
					name: "Quick Mutes",
					value: data.executed.quickMutes.toString(),
					inline: true
				},
				{
					name: "Kicks",
					value: data.executed.kicks.toString(),
					inline: true
				},
				{
					name: "Unbans",
					value: data.executed.unbans.toString(),
					inline: true
				},
				{
					name: "Unmutes",
					value: data.executed.unmutes.toString(),
					inline: true
				},
				{
					name: "Bans",
					value: data.executed.bans.toString(),
					inline: true
				},
				{
					name: "Archived",
					value: data.executed.archived.toString(),
					inline: true
				}
			]);

		const reviewedRequestsEmbed = new EmbedBuilder()
			.setColor(DEFAULT_EMBED_COLOR)
			.setTitle("Reviewed Requests")
			.setDescription("The following analytics involve the number of requests **reviewed** by the user.")
			.setFields([
				{
					name: "Ban Requests",
					value: Moderation._formatObjectProps(data.reviewed.banRequests),
					inline: true
				},
				{
					name: "Mute Requests",
					value: Moderation._formatObjectProps(data.reviewed.muteRequests),
					inline: true
				},
				{
					name: "\u200b",
					value: "\u200b",
					inline: true
				}
			]);

		const requestsMadeEmbed = new EmbedBuilder()
			.setColor(DEFAULT_EMBED_COLOR)
			.setTitle("Requests Made")
			.setDescription("The following analytics involve the number of requests **made** by the user.")
			.setFields([
				{
					name: "Ban Requests",
					value: Moderation._formatObjectProps(data.requested.banRequests),
					inline: true
				},
				{
					name: "Mute Requests",
					value: Moderation._formatObjectProps(data.requested.muteRequests),
					inline: true
				},
				{
					name: "\u200b",
					value: "\u200b",
					inline: true
				}
			])
			.setFooter({ text: `User ID: ${user.id}` });

		if (month) {
			const strMonth = new Date(0, month - 1).toLocaleString(undefined, { month: "long" });
			embed.setTitle(strMonth);
		}

		if (year) {
			embed.setTitle(`${embed.data.title ?? ""} ${year}`);
		}

		if (!embed.data.title) {
			embed.setTitle("All-Time");
		}

		const infractionsReceivedButton = new ButtonBuilder()
			.setLabel("Infractions Received")
			.setStyle(ButtonStyle.Secondary)
			.setCustomId(`infraction-search-${user.id}`);

		const infractionsDealtButton = new ButtonBuilder()
			.setLabel("Infractions Dealt (WIP)")
			.setStyle(ButtonStyle.Secondary)
			.setCustomId("wip")
			.setDisabled(true);

		const actionRow = new ActionRowBuilder<ButtonBuilder>()
			.setComponents(infractionsReceivedButton, infractionsDealtButton);

		const ephemeral = interaction.channel
			? config.channelInScope(interaction.channel, config.data.moderation_activity_ephemeral_scoping)
			: true;

		return {
			embeds: [embed, reviewedRequestsEmbed, requestsMadeEmbed],
			components: [actionRow],
			ephemeral
		};
	}

	private static _formatObjectProps<K extends string>(obj: Record<K, number>): string {
		return Object.entries(obj)
			.map(([key, value]) => {
				const separatedKey = key.replace(/([a-z])([A-Z])/g, "$1 $2");
				return `${capitalize(separatedKey)}: \`${value}\``;
			})
			.join("\n");
	}

	private static async _getActivity(userId: Snowflake, guildId: Snowflake, filter?: ModerationActivityFilter): Promise<ModerationActivity> {
		const formatArgs: string[] = [];
		const valueArgs: string[] = [];

		if (filter?.year) {
			formatArgs.push("%Y");
			valueArgs.push(filter.year.toString());
		}

		if (filter?.month) {
			formatArgs.push("%m");
			valueArgs.push(filter.month < 10 ? `0${filter.month}` : filter.month.toString());
		}

		const format = formatArgs.join("-");
		const value = valueArgs.join("-");

		const infractions = await prisma.$queryRaw<Infraction[]>`
            SELECT *
            FROM Infraction
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND executor_id = ${userId}
              AND guild_id = ${guildId};
        `;

		const muteRequests = await prisma.$queryRaw<MuteRequest[]>`
            SELECT *
            FROM MuteRequest
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND (author_id = ${userId} OR reviewer_id = ${userId})
              AND guild_id = ${guildId};
        `;

		const banRequests = await prisma.$queryRaw<BanRequest[]>`
            SELECT *
            FROM BanRequest
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND (author_id = ${userId} OR reviewer_id = ${userId})
              AND guild_id = ${guildId};
        `;

		const activity: ModerationActivity = {
			executed: {
				bans: 0,
				manualMutes: 0,
				quickMutes: 0,
				kicks: 0,
				unbans: 0,
				unmutes: 0,
				warns: 0,
				notes: 0,
				archived: 0
			},
			requested: {
				banRequests: {
					approved: 0,
					denied: 0,
					unknown: 0,
					deleted: 0,
					pending: 0
				},
				muteRequests: {
					approved: 0,
					denied: 0,
					unknown: 0,
					deleted: 0,
					pending: 0
				}
			},
			reviewed: {
				banRequests: { approved: 0, denied: 0, unknown: 0 },
				muteRequests: { approved: 0, denied: 0, unknown: 0 }
			}
		};

		for (const infraction of infractions) {
			if (!infraction.request_author_id) {
				Moderation._evaluateDealtInfraction(infraction, activity);
			}
		}

		Moderation._evaluateMuteRequests(muteRequests, activity, userId);
		Moderation._evaluateBanRequests(banRequests, activity, userId);

		return activity;
	}

	private static _evaluateDealtInfraction(infraction: Infraction, activity: ModerationActivity): void {
		if (infraction.archived_at && infraction.archived_by) {
			activity.executed.archived++;
			return;
		}

		switch (infraction.action) {
			case InfractionAction.Ban: {
				activity.executed.bans++;
				break;
			}

			case InfractionAction.Kick: {
				activity.executed.kicks++;
				break;
			}

			case InfractionAction.Mute: {
				if (infraction.flag === InfractionFlag.Quick) {
					activity.executed.quickMutes++;
				} else {
					activity.executed.manualMutes++;
				}
				break;
			}

			case InfractionAction.Unban: {
				activity.executed.unbans++;
				break;
			}

			case InfractionAction.Unmute: {
				activity.executed.unmutes++;
				break;
			}

			case InfractionAction.Warn: {
				activity.executed.warns++;
				break;
			}

			case InfractionAction.Note: {
				activity.executed.notes++;
				break;
			}
		}
	}

	private static _evaluateMuteRequests(muteRequests: MuteRequest[], activity: ModerationActivity, targetId: Snowflake): void {
		for (const muteRequest of muteRequests) {
			const isReviewer = muteRequest.reviewer_id === targetId;
			const isRequestAuthor = muteRequest.author_id === targetId;

			switch (muteRequest.status) {
				case MuteRequestStatus.Approved: {
					if (isReviewer) {
						activity.reviewed.muteRequests.approved++;
					} else if (isRequestAuthor) {
						activity.requested.muteRequests.approved++;
					}
					break;
				}

				case MuteRequestStatus.Denied: {
					if (isReviewer) {
						activity.reviewed.muteRequests.denied++;
					} else if (isRequestAuthor) {
						activity.requested.muteRequests.denied++;
					}
					break;
				}

				case MuteRequestStatus.Unknown: {
					if (isReviewer) {
						activity.reviewed.muteRequests.unknown++;
					} else if (isRequestAuthor) {
						activity.requested.muteRequests.unknown++;
					}
					break;
				}

				case MuteRequestStatus.Pending: {
					if (isRequestAuthor) {
						activity.requested.muteRequests.pending++;
					}
					break;
				}

				case MuteRequestStatus.Deleted: {
					if (isRequestAuthor) {
						activity.requested.muteRequests.deleted++;
					}
					break;
				}
			}
		}
	}

	private static _evaluateBanRequests(banRequests: BanRequest[], activity: ModerationActivity, targetId: Snowflake): void {
		for (const banRequest of banRequests) {
			const isReviewer = banRequest.reviewer_id === targetId;
			const isRequestAuthor = banRequest.author_id === targetId;

			switch (banRequest.status) {
				case BanRequestStatus.Approved: {
					if (isReviewer) {
						activity.reviewed.banRequests.approved++;
					} else if (isRequestAuthor) {
						activity.requested.banRequests.approved++;
					}
					break;
				}

				case BanRequestStatus.Denied: {
					if (isReviewer) {
						activity.reviewed.banRequests.denied++;
					} else if (isRequestAuthor) {
						activity.requested.banRequests.denied++;
					}
					break;
				}

				case BanRequestStatus.Unknown: {
					if (isReviewer) {
						activity.reviewed.banRequests.unknown++;
					} else if (isRequestAuthor) {
						activity.requested.banRequests.unknown++;
					}
					break;
				}

				case BanRequestStatus.Pending: {
					if (isRequestAuthor) {
						activity.requested.banRequests.pending++;
					}
					break;
				}

				case BanRequestStatus.Deleted: {
					if (isRequestAuthor) {
						activity.requested.banRequests.deleted++;
					}
					break;
				}
			}
		}
	}
}

interface ModerationActivityFilter {
    month: number | null;
    year: number | null;
}

interface ModerationActivity {
    executed: InfractionsExecuted;
    requested: {
		banRequests: RequestMadeStatus;
		muteRequests: RequestMadeStatus;
    };
    reviewed: {
		banRequests: RequestStatus;
		muteRequests: RequestStatus;
    };
}

interface InfractionsExecuted {
    bans: number;
    manualMutes: number;
    quickMutes: number;
    kicks: number;
    unbans: number;
    unmutes: number;
    warns: number;
    notes: number;
    archived: number;
}

interface RequestStatus {
	approved: number;
	denied: number;
	unknown: number;
}

interface RequestMadeStatus extends RequestStatus {
	deleted: number;
	pending: number;
}