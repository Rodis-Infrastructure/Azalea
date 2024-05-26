import {
    ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    codeBlock
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { RequestStatus } from "@utils/requests";
import { ModerationRequestType } from "@managers/config/schema";
import { Action, Flag } from "@utils/infractions";
import { Infraction, ModerationRequest } from "@prisma/client";

import Command from "@managers/commands/Command";

const CURRENT_YEAR = new Date().getFullYear();

// Months of the year mapped by their names as labels and positions as values
const months: ApplicationCommandOptionChoiceData<number>[] = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(0, i);
    const month = date.toLocaleString(undefined, { month: "long" });

    return { name: month, value: i + 1 };
});

export default class ModerationActivity extends Command<ChatInputCommandInteraction<"cached">> {
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
        const formatArgs: string[] = [];
        const valueArgs: string[] = [];

        if (year) {
            formatArgs.push("%Y");
            valueArgs.push(year.toString());
        }

        if (month) {
            formatArgs.push("%m");
            valueArgs.push(month < 10 ? `0${month}` : month.toString());
        }

        const format = formatArgs.join("-");
        const value = valueArgs.join("-");

        const infractions = await prisma.$queryRaw<Infraction[]>`
            SELECT * FROM Infraction
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND executor_id = ${user.id}
              AND guild_id = ${interaction.guildId}
              AND archived_at IS NULL
              AND archived_by IS NULL
        `;
        
        const requests = await prisma.$queryRaw<ModerationRequest[]>`
            SELECT * FROM ModerationRequest
            WHERE strftime(${format}, datetime(created_at / 1000, 'unixepoch')) = ${value}
              AND author_id = ${user.id}
              AND guild_id = ${interaction.guildId}
              AND status NOT IN (${RequestStatus.Pending}, ${RequestStatus.Unknown})
        `;

        const stats = {
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
            // The infraction was executed by the user
            if (!infraction.request_author_id) {
                switch (infraction.action) {
                    case Action.Ban: {
                        stats.executed.bans++;
                        break;
                    }

                    case Action.Kick: {
                        stats.executed.kicks++;
                        break;
                    }

                    case Action.Mute: {
                        if (infraction.flag === Flag.Quick) {
                            stats.executed.quickMutes++;
                        } else {
                            stats.executed.manualMutes++;
                        }
                        break;
                    }

                    case Action.Unban: {
                        stats.executed.unbans++;
                        break;
                    }

                    case Action.Unmute: {
                        stats.executed.unmutes++;
                        break;
                    }

                    case Action.Warn: {
                        stats.executed.warns++;
                        break;
                    }
                }
            }

            // The infraction was reviewed by the user
            if (infraction.executor_id === user.id && infraction.request_author_id) {
                switch (infraction.action) {
                    case Action.Ban: {
                        stats.reviewed.approved.bans++;
                        break;
                    }

                    case Action.Mute: {
                        stats.reviewed.approved.mutes++;
                        break;
                    }
                }
            }
        }

        // The infractions were requested by the user
        for (const request of requests) {
            switch (request.type) {
                case ModerationRequestType.Ban: {
                    if (request.status === RequestStatus.Approved) {
                        stats.requested.approved.bans++;
                    } else if (request.status === RequestStatus.Denied) {
                        stats.requested.denied.bans++;
                    }
                    break;
                }

                case ModerationRequestType.Mute: {
                    if (request.status === RequestStatus.Approved) {
                        stats.requested.approved.mutes++;
                    } else if (request.status === RequestStatus.Denied) {
                        stats.requested.denied.mutes++;
                    }
                    break;
                }
            }
        }

        const data = codeBlock("json", JSON.stringify(stats, null, 2));
        return `Data for ${user} [${value || "all-time"}]\n${data}`;
    }
}