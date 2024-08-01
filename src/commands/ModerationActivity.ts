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
        const moderationActivity = await Moderation._getActivity(user.id, interaction.guildId, { month, year });

        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setAuthor({
                name: `Moderation activity of @${user.username}`,
                iconURL: user.displayAvatarURL()
            })
            .setFields([
                {
                    name: "Requested (Approved)",
                    value: Moderation._formatObjectProps(moderationActivity.requested.approved),
                    inline: true
                },
                {
                    name: "Requested (Denied)",
                    value: Moderation._formatObjectProps(moderationActivity.requested.denied),
                    inline: true
                },
                {
                    name: "Reviewed (Approved)",
                    value: Moderation._formatObjectProps(moderationActivity.reviewed.approved),
                    inline: true
                },
                {
                    name: "Reviewed (Denied)",
                    value: Moderation._formatObjectProps(moderationActivity.reviewed.denied),
                    inline: true
                },
                {
                    name: "Executed",
                    value: Moderation._formatObjectProps(moderationActivity.executed),
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
            embeds: [embed],
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
              AND guild_id = ${guildId}
              AND archived_at IS NULL
              AND archived_by IS NULL
        `;

        const muteRequests = await prisma.$queryRaw<MuteRequest[]>`
            SELECT *
            FROM MuteRequest
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND author_id = ${userId}
              AND guild_id = ${guildId}
              AND status IN (${MuteRequestStatus.Approved}, ${MuteRequestStatus.Denied})
        `;

        const banRequests = await prisma.$queryRaw<BanRequest[]>`
            SELECT *
            FROM BanRequest
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND author_id = ${userId}
              AND guild_id = ${guildId}
              AND status IN (${BanRequestStatus.Approved}, ${BanRequestStatus.Denied})
        `;

        const activity: ModerationActivity = {
            executed: {
                bans: 0,
                manualMutes: 0,
                quickMutes: 0,
                kicks: 0,
                unbans: 0,
                unmutes: 0,
                warns: 0
            },
            requested: {
                approved: { bans: 0, mutes: 0 },
                denied: { bans: 0, mutes: 0 }
            },
            reviewed: {
                approved: { bans: 0, mutes: 0 },
                denied: { bans: 0, mutes: 0 }
            }
        };

        for (const infraction of infractions) {
            if (infraction.request_author_id) {
                Moderation._evaluateReviewedInfraction(infraction, activity);
            } else {
                Moderation._evaluateDealtInfraction(infraction, activity);
            }
        }

        Moderation._evaluateRequestedMutes(muteRequests, activity);
        Moderation._evaluateRequestedBans(banRequests, activity);

        return activity;
    }

    private static _evaluateDealtInfraction(infraction: Infraction, activity: ModerationActivity): void {
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
        }
    }

    private static _evaluateReviewedInfraction(infraction: Infraction, activity: ModerationActivity): void {
        switch (infraction.action) {
            case InfractionAction.Ban: {
                if (infraction.status === BanRequestStatus.Approved) {
                    activity.reviewed.approved.bans++;
                } else {
                    activity.reviewed.denied.bans++;
                }
                break;
            }

            case InfractionAction.Mute: {
                if (infraction.status === MuteRequestStatus.Approved) {
                    activity.reviewed.approved.mutes++;
                } else {
                    activity.reviewed.denied.mutes++;
                }
                break;
            }
        }
    }

    private static _evaluateRequestedMutes(muteRequests: MuteRequest[], activity: ModerationActivity): void {
        for (const muteRequest of muteRequests) {
            switch (muteRequest.status) {
                case MuteRequestStatus.Approved: {
                    activity.requested.approved.mutes++;
                    break;
                }

                case MuteRequestStatus.Denied: {
                    activity.requested.denied.mutes++;
                    break;
                }
            }
        }
    }

    private static _evaluateRequestedBans(banRequests: BanRequest[], activity: ModerationActivity): void {
        for (const banRequest of banRequests) {
            switch (banRequest.status) {
                case BanRequestStatus.Approved: {
                    activity.requested.approved.bans++;
                    break;
                }

                case BanRequestStatus.Denied: {
                    activity.requested.denied.bans++;
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
    requested: InfractionRequests;
    reviewed: InfractionRequests;
}

interface InfractionsExecuted {
    bans: number;
    manualMutes: number;
    quickMutes: number;
    kicks: number;
    unbans: number;
    unmutes: number;
    warns: number;
}

interface InfractionRequests {
    approved: {
        bans: number;
        mutes: number;
    };
    denied: {
        bans: number;
        mutes: number;
    };
}
