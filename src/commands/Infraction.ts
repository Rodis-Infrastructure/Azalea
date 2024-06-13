import {
    ActionRowBuilder,
    APIEmbedField,
    ApplicationCommandOptionChoiceData,
    ApplicationCommandOptionType,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Colors,
    EmbedBuilder,
    GuildMember,
    Snowflake,
    time,
    TimestampStyles,
    User,
    userMention
} from "discord.js";

import {
    DEFAULT_EMBED_COLOR,
    DEFAULT_INFRACTION_REASON,
    DEFAULT_MUTE_DURATION,
    EMBED_FIELD_CHAR_LIMIT,
    MAX_MUTE_DURATION
} from "@utils/constants";

import {
    elipsify,
    humanizeTimestamp,
    userMentionWithId,
    pluralize
} from "@/utils";

import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { Prisma, Infraction as InfractionPayload } from "@prisma/client";
import { log } from "@utils/logging";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { InfractionAction, InfractionFlag, InfractionUtil } from "@utils/infractions";

import GuildConfig from "@managers/config/GuildConfig";
import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";
import ms from "ms";

// Filter infraction search results
export enum InfractionSearchFilter {
    // Show all infractions, including automatic ones
    All = "All",
    // Don't show notes
    Infractions = "Infractions",
    // Only show automatic infractions
    Automatic = "Automatic",
    // Only show non-automatic infractions (default)
    Manual = "Manual",
    // Only show archived infractions
    Archived = "Archived",
    // Only show notes
    Notes = "Notes"
}

const infractionSearchFilterChoices: ApplicationCommandOptionChoiceData<string>[] = Object.keys(InfractionSearchFilter)
    .map(key => ({ name: key, value: key }));

export default class Infraction extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "infraction",
            description: "Manage a user's infractions",
            options: [
                {
                    name: InfractionSubcommand.Search,
                    description: "Search a user's infractions",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "user",
                            description: "The user to search the infractions of",
                            type: ApplicationCommandOptionType.User,
                            required: true
                        },
                        {
                            name: "filter",
                            description: "The filter to apply to the search (excludes notes by default)",
                            type: ApplicationCommandOptionType.String,
                            choices: infractionSearchFilterChoices
                        }
                    ]
                },
                {
                    name: InfractionSubcommand.Info,
                    description: "Get a detailed overview of an infraction",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [{
                        name: "infraction_id",
                        description: "ID of the infraction to view",
                        type: ApplicationCommandOptionType.Integer,
                        min_value: 1,
                        required: true
                    }]
                },
                {
                    name: InfractionSubcommand.Duration,
                    description: "Update the duration of a temporary infraction",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "infraction_id",
                            description: "ID of the infraction to change the duration of",
                            type: ApplicationCommandOptionType.Integer,
                            min_value: 1,
                            required: true
                        },
                        {
                            name: "new_duration",
                            description: "New duration of the infraction",
                            type: ApplicationCommandOptionType.String,
                            required: true
                        }
                    ]
                },
                {
                    name: InfractionSubcommand.Active,
                    description: "List active infractions",
                    type: ApplicationCommandOptionType.Subcommand
                },
                {
                    name: InfractionSubcommand.Transfer,
                    description: "Transfer one user's infraction history to another user",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "source_user",
                            description: "The user to transfer the infractions from",
                            type: ApplicationCommandOptionType.User,
                            required: true
                        },
                        {
                            name: "target_user",
                            description: "The user to transfer the infractions to",
                            type: ApplicationCommandOptionType.User,
                            required: true
                        }
                    ]
                },
                {
                    name: InfractionSubcommand.Reason,
                    description: "Update the reason of an infraction",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "infraction_id",
                            description: "ID of the infraction to change the reason of",
                            type: ApplicationCommandOptionType.Integer,
                            min_value: 1,
                            required: true
                        },
                        {
                            name: "new_reason",
                            description: "New reason of the infraction",
                            type: ApplicationCommandOptionType.String,
                            max_length: EMBED_FIELD_CHAR_LIMIT,
                            required: true
                        }
                    ]
                },
                {
                    name: InfractionSubcommand.Archive,
                    description: "Archive an infraction",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [{
                        name: "infraction_id",
                        description: "ID of the infraction to archive",
                        type: ApplicationCommandOptionType.Integer,
                        min_value: 1,
                        required: true
                    }]
                },
                {
                    name: InfractionSubcommand.Restore,
                    description: "Restore an archived infraction",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [{
                        name: "infraction_id",
                        description: "ID of the infraction to restore",
                        type: ApplicationCommandOptionType.Integer,
                        min_value: 1,
                        required: true
                    }]
                }
            ]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const subcommand = interaction.options.getSubcommand();
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        switch (subcommand) {
            case InfractionSubcommand.Search: {
                const member = interaction.options.getMember("user");

                // Ensure the executor has sufficient permissions when
                // trying to view the infractions of another staff member
                if (
                    member &&
                    config.hasPermission(member, Permission.ViewInfractions) &&
                    !config.hasPermission(interaction.member, Permission.ViewModerationActivity)
                ) {
                    return {
                        content: "You do not have permission to view this user's infractions",
                        temporary: true
                    };
                }

                const user = member?.user ?? interaction.options.getUser("user", true);
                const filter = (interaction.options.getString("filter") ?? InfractionSearchFilter.Infractions) as InfractionSearchFilter;

                return Infraction.search({
                    guildId: interaction.guildId,
                    page: 1,
                    filter,
                    user
                });
            }

            case InfractionSubcommand.Reason: {
                const infractionId = interaction.options.getInteger("infraction_id", true);
                const reason = interaction.options.getString("new_reason", true);

                return Infraction.setReason({
                    executor: interaction.member,
                    infractionId,
                    reason,
                    config
                });
            }

            case InfractionSubcommand.Duration: {
                const infractionId = interaction.options.getInteger("infraction_id", true);
                const duration = interaction.options.getString("new_duration", true);

                return Infraction._setDuration({
                    executor: interaction.member,
                    infractionId,
                    duration,
                    config
                });
            }

            case InfractionSubcommand.Active: {
                if (!interaction.channel) {
                    return {
                        content: "Failed to fetch the current channel.",
                        temporary: true
                    };
                }

                const ephemeral = config.channelInScope(interaction.channel);
                await interaction.deferReply({ ephemeral });
                return Infraction.listActive();
            }

            case InfractionSubcommand.Archive: {
                const infractionId = interaction.options.getInteger("infraction_id", true);
                return Infraction._archive(infractionId, interaction.member, config);
            }

            case InfractionSubcommand.Restore: {
                const infractionId = interaction.options.getInteger("infraction_id", true);

                if (!config.hasPermission(interaction.member, Permission.ManageInfractions)) {
                    return {
                        content: "You do not have permission to restore infractions.",
                        temporary: true
                    };
                }

                return Infraction._restore(infractionId, interaction.member, config);
            }

            case InfractionSubcommand.Info: {
                const infractionId = interaction.options.getInteger("infraction_id", true);
                return Infraction.info(infractionId, interaction.guildId);
            }

            case InfractionSubcommand.Transfer: {
                if (!config.hasPermission(interaction.member, Permission.TransferInfractions)) {
                    return {
                        content: "You do not have permission to transfer infractions.",
                        temporary: true
                    };
                }

                const sourceUser = interaction.options.getUser("source_user", true);
                const targetUser = interaction.options.getUser("target_user", true);

                return Infraction._transfer(sourceUser, targetUser, interaction.guildId);
            }

            default:
                return {
                    content: "Unknown subcommand",
                    temporary: true
                };
        }
    }

    private static async _transfer(sourceUser: User, targetUser: User, guildId: Snowflake): Promise<InteractionReplyData> {
        const sourceInfractions = await prisma.infraction.findMany({
            where: {
                target_id: sourceUser.id,
                guild_id: guildId
            }
        });

        if (!sourceInfractions.length) {
            return {
                content: `No infractions found for ${sourceUser}`,
                temporary: true
            };
        }

        const targetInfractions = sourceInfractions.map(infraction => ({
            ...infraction,
            id: undefined,
            target_id: targetUser.id
        }));

        await prisma.infraction.createMany({ data: targetInfractions });

        return {
            content: `Successfully transferred \`${sourceInfractions.length}\` ${pluralize(sourceInfractions.length, "infraction")} from ${sourceUser} to ${targetUser}`,
            temporary: true
        };
    }

    static async listActive(page = 1): Promise<InteractionReplyData> {
        const RESULTS_PER_PAGE = 5;
        const skipMultiplier = page - 1;
        const queryConditions = {
            archived_at: null,
            archived_by: null,
            expires_at: { gt: new Date() }
        };

        const [infractions, activeInfractionCount] = await prisma.$transaction([
            prisma.infraction.findMany({
                orderBy: { id: "desc" },
                skip: skipMultiplier * RESULTS_PER_PAGE,
                take: RESULTS_PER_PAGE,
                where: queryConditions
            }),
            prisma.infraction.count({
                where: queryConditions
            })
        ]);

        const paginationComponents: ActionRowBuilder<ButtonBuilder>[] = [];

        // Add pagination if there are more results than can be displayed
        if (activeInfractionCount > RESULTS_PER_PAGE) {
            const totalPageCount = Math.ceil(activeInfractionCount / RESULTS_PER_PAGE);
            const paginationActionRow = Infraction._getPaginationActionRow({
                page,
                totalPageCount,
                paginationButtonCustomIdPrefix: "infraction-active"
            });

            paginationComponents.push(paginationActionRow);
        }

        const fields = Infraction._formatInfractionSearchFields(infractions, true);
        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setTitle(`${activeInfractionCount} Active ${pluralize(activeInfractionCount, "Infraction")}`)
            .setFields(fields)
            .setTimestamp();

        return {
            embeds: [embed],
            components: paginationComponents
        };
    }

    /**
     * Get a detailed overview of an infraction
     *
     * @param infractionId - ID of the infraction to view the details of
     * @param guildId - ID of the guild the infraction was given in
     * @returns An interaction reply with the result of the operation
     * @private
     */
    static async info(infractionId: number, guildId: Snowflake): Promise<InteractionReplyData> {
        const infraction = await prisma.infraction.findUnique({
            where: {
                id: infractionId,
                guild_id: guildId
            }
        });

        if (!infraction) {
            return {
                content: `Infraction with ID \`#${infractionId}\` not found.`,
                temporary: true
            };
        }

        const embedColor = InfractionUtil.mapActionToEmbedColor(infraction.action);
        const formattedAction = InfractionUtil.formatAction(infraction.action, infraction.flag);

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(formattedAction)
            .setDescription(infraction.reason)
            .setFields([
                {
                    name: "Offender",
                    value: userMentionWithId(infraction.target_id)
                },
                {
                    name: "Executor",
                    value: userMentionWithId(infraction.executor_id)
                }
            ])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp(infraction.created_at);

        if (infraction.expires_at) {
            const msExpiresAt = infraction.expires_at.getTime();

            // Use a timestamp if the infraction is still active
            // otherwise, show a static duration
            if (msExpiresAt > Date.now()) {
                embed.data.title += ` (expires ${time(infraction.expires_at, TimestampStyles.RelativeTime)})`;
            } else {
                const msCreatedAt = infraction.created_at.getTime();
                const duration = humanizeTimestamp(msExpiresAt - msCreatedAt);
                embed.data.title += `  •  ${duration}`;
            }
        }

        if (infraction.request_author_id) {
            embed.addFields({
                name: "Requested By",
                value: userMentionWithId(infraction.request_author_id)
            });
        }

        const changes: string[] = [];

        if (infraction.updated_at && infraction.updated_by) {
            const timestamp = time(infraction.updated_at, TimestampStyles.RelativeTime);
            changes.push(`- Updated ${timestamp} by ${userMention(infraction.updated_by)}`);
        }

        if (infraction.archived_at && infraction.archived_by) {
            const timestamp = time(infraction.archived_at, TimestampStyles.RelativeTime);
            changes.push(`- Archived ${timestamp} by ${userMention(infraction.archived_by)}`);
        }

        if (changes.length) {
            embed.addFields({
                name: "Changes",
                value: changes.join("\n")
            });
        }

        return { embeds: [embed] };
    }

    /**
     * Archives an infraction by:
     *
     * - Updating the infraction's archived status in the database.
     * - Logging the archive in the appropriate channel.
     *
     * @param infractionId - ID of the infraction to archive
     * @param executor - The user responsible for archiving the infraction
     * @param config - The guild configuration
     * @returns An interaction reply with the result of the operation
     * @private
     */
    private static async _archive(infractionId: number, executor: GuildMember, config: GuildConfig): Promise<InteractionReplyData> {
        const infraction = await prisma.infraction.findUnique({
            where: { id: infractionId, archived_at: null },
            select: {
                executor_id: true,
                expires_at: true,
                action: true,
                flag: true
            }
        });

        if (!infraction) {
            return {
                content: `Infraction with ID \`#${infractionId}\` not found.`,
                temporary: true
            };
        }

        // Check whether the executor has permission to manage infractions
        if (infraction.executor_id !== executor.id && !config.hasPermission(executor, Permission.ManageInfractions)) {
            return {
                content: "You do not have permission to archive this infraction.",
                temporary: true
            };
        }

        // Check whether the infraction is active (if it's temporary)
        if (infraction.expires_at && infraction.expires_at > new Date()) {
            return {
                content: "Cannot archive an active infraction.",
                temporary: true
            };
        }

        await prisma.infraction.update({
            where: { id: infractionId },
            data: {
                archived_at: new Date(),
                archived_by: executor.id
            }
        });

        const formattedAction = InfractionUtil.formatAction(infraction.action, infraction.flag);
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Infraction Archived" })
            .setTitle(formattedAction)
            .setFields([{
                name: "Archived By",
                value: userMentionWithId(executor.id)
            }])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp();

        log({
            event: LoggingEvent.InfractionArchive,
            message: { embeds: [embed] },
            channel: null,
            member: executor,
            config
        });

        return {
            content: `Successfully archived infraction \`#${infractionId}\``,
            temporary: true
        };
    }

    /**
     * Restores an archived infraction by:
     *
     * - Updating the infraction's archived status in the database.
     * - Logging the restoration in the appropriate channel.
     *
     * @param infractionId - ID of the infraction to restore
     * @param executor - The user responsible for restoring the infraction
     * @param config - The guild configuration
     * @returns An interaction reply with the result of the operation
     * @private
     */
    private static async _restore(infractionId: number, executor: GuildMember, config: GuildConfig): Promise<InteractionReplyData> {
        const infraction = await prisma.infraction.update({
            where: { id: infractionId, archived_at: { not: null } },
            select: { action: true, flag: true },
            data: {
                archived_at: null,
                archived_by: null
            }
        }).catch(() => null);

        if (!infraction) {
            return {
                content: `Archived infraction with ID \`#${infractionId}\` not found.`,
                temporary: true
            };
        }

        const formattedAction = InfractionUtil.formatAction(infraction.action, infraction.flag);
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Infraction Restored" })
            .setTitle(formattedAction)
            .setFields([{
                name: "Restored By",
                value: userMentionWithId(executor.id)
            }])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp();

        log({
            event: LoggingEvent.InfractionRestore,
            message: { embeds: [embed] },
            channel: null,
            member: executor,
            config
        });

        return {
            content: `Successfully restored infraction \`#${infractionId}\``,
            temporary: true
        };
    }

    /**
     * Handles the expiration date change of an infraction by:
     *
     * - Updating the expiration date in the database.
     * - Logging the change in the appropriate channel.
     *
     * @param data.infractionId - ID of the infraction to modify
     * @param data.duration - New duration of the infraction
     * @param data.executor - The user responsible for changing the duration
     * @param data.config - The guild configuration
     * @returns An interaction reply with the result of the operation
     * @private
     */
    private static async _setDuration(data: {
        infractionId: number;
        duration: string;
        executor: GuildMember;
        config: GuildConfig;
    }): Promise<InteractionReplyData> {
        const { infractionId, duration, executor, config } = data;

        const oldState = await prisma.infraction.findUnique({
            where: {
                id: infractionId,
                action: InfractionAction.Mute,
                expires_at: { gt: new Date() }
            },
            select: {
                reason: true,
                executor_id: true,
                created_at: true,
                expires_at: true,
                target_id: true
            }
        });

        if (!oldState) {
            return {
                content: `Active mute with ID \`#${infractionId}\` not found.`,
                temporary: true
            };
        }

        // Ensure the executor is either the original executor or has permission to manage infractions
        if (oldState.executor_id !== executor.id && !config.hasPermission(executor, Permission.ManageInfractions)) {
            return {
                content: "You do not have permission to update the duration of this mute.",
                temporary: true
            };
        }

        let msDuration = ms(duration);

        if (!msDuration || msDuration < 0) {
            return {
                content: "Invalid duration provided. Please provide a valid duration.",
                temporary: true
            };
        }

        if (msDuration > MAX_MUTE_DURATION) {
            msDuration = DEFAULT_MUTE_DURATION;
        }

        const targetMember = await config.guild.members
            .fetch(oldState.target_id)
            .catch(() => null);

        await targetMember?.timeout(msDuration, `Duration change of infraction #${infractionId}`);

        const msExpiresAt = oldState.created_at.getTime() + msDuration;
        const expiresAt = new Date(msExpiresAt);

        const newState = await prisma.infraction.update({
            where: { id: infractionId },
            select: { flag: true },
            data: {
                updated_at: new Date(),
                updated_by: executor.id,
                expires_at: expiresAt
            }
        });

        const msOldDuration = oldState.expires_at!.getTime() - oldState.created_at.getTime();
        const formattedAction = InfractionUtil.formatAction(InfractionAction.Mute, newState.flag);

        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setAuthor({ name: "Infraction Duration Changed" })
            .setTitle(formattedAction)
            .setFields([
                {
                    name: "Updated By",
                    value: userMentionWithId(executor.id)
                },
                {
                    name: "Old Duration",
                    value: humanizeTimestamp(msOldDuration)
                },
                {
                    name: "New Duration",
                    value: humanizeTimestamp(msDuration)
                }
            ])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp();

        log({
            event: LoggingEvent.InfractionUpdate,
            message: { embeds: [embed] },
            channel: null,
            member: executor,
            config
        });

        return {
            content: `Successfully updated the duration of infraction \`#${infractionId}\` (expires ${time(expiresAt, TimestampStyles.RelativeTime)})`,
            temporary: true
        };
    }

    /**
     * Handles the reason change of an infraction by:
     *
     * - Updating the reason in the database.
     * - Logging the change in the appropriate channel.
     *
     * @param data.infractionId - ID of the infraction to modify
     * @param data.reason - New reason of the infraction
     * @param data.executor - The user responsible for changing the reason
     * @param data.config - The guild configuration
     * @returns An interaction reply with the result of the operation
     * @private
     */
    static async setReason(data: {
        infractionId: number;
        reason: string;
        executor: GuildMember;
        config: GuildConfig;
    }): Promise<InteractionReplyData> {
        const { infractionId, reason, executor, config } = data;

        const oldState = await prisma.infraction.findUnique({
            where: { id: infractionId },
            select: {
                reason: true,
                executor_id: true,
                flag: true,
                target_id: true
            }
        }).catch(() => null);

        if (!oldState) {
            return {
                content: `Infraction with ID \`#${infractionId}\` not found.`,
                temporary: true
            };
        }

        // Ensure the executor is either the original executor or has permission to manage infractions
        if (oldState.executor_id !== executor.id && !config.hasPermission(executor, Permission.ManageInfractions)) {
            return {
                content: "You do not have permission to update the reason of this infraction.",
                temporary: true
            };
        }

        const validationResult = await InfractionUtil.validateReason(reason, config);

        if (!validationResult.success) {
            return validationResult.message;
        }

        const newState = await prisma.infraction.update({
            where: { id: infractionId },
            select: { action: true, flag: true },
            data: {
                updated_at: new Date(),
                updated_by: executor.id,
                executor_id: oldState.flag === InfractionFlag.Automatic ? executor.id : undefined,
                flag: 0,
                reason
            }
        });

        const formattedAction = InfractionUtil.formatAction(newState.action, newState.flag);
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Infraction Reason Changed" })
            .setTitle(formattedAction)
            .setFields([
                {
                    name: "Updated By",
                    value: userMentionWithId(executor.id)
                },
                {
                    name: "Target",
                    value: userMentionWithId(oldState.target_id)
                },
                {
                    name: "Old Reason",
                    value: oldState.reason ?? DEFAULT_INFRACTION_REASON
                },
                {
                    name: "New Reason",
                    value: reason
                }
            ])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp();

        log({
            event: LoggingEvent.InfractionUpdate,
            message: { embeds: [embed] },
            channel: null,
            member: executor,
            config
        });

        const formattedReason = InfractionUtil.formatReason(reason);

        return {
            content: `Successfully updated the reason of infraction \`#${infractionId}\` ${formattedReason}`,
            temporary: true
        };
    }

    /**
     * Searches a user's infractions
     *
     * @param data.user - The user to search the infractions of
     * @param data.guildId - The guild ID to search infractions in
     * @param data.filter - The filter to apply to the search
     * @param data.page - The page number
     * @returns An interaction reply with the search results
     */
    static async search(data: {
        user: User,
        guildId: Snowflake,
        filter: InfractionSearchFilter,
        page: number
    }): Promise<InteractionReplyData> {
        const { user, guildId, filter, page } = data;

        const RESULTS_PER_PAGE = 5;
        const skipMultiplier = page - 1;
        const queryConditions = Infraction._parseSearchFilter(filter);

        const [infractions, infractionCount] = await prisma.$transaction([
            prisma.infraction.findMany({
                skip: skipMultiplier * RESULTS_PER_PAGE,
                take: RESULTS_PER_PAGE,
                where: {
                    target_id: user.id,
                    guild_id: guildId,
                    ...queryConditions
                },
                orderBy: {
                    id: "desc"
                }
            }),
            prisma.infraction.count({
                where: {
                    target_id: user.id,
                    guild_id: guildId,
                    ...queryConditions
                }
            })
        ]);

        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setTitle(`Filter: ${filter}`)
            .setAuthor({
                name: `Infractions of @${user.username}`,
                iconURL: user.displayAvatarURL(),
                url: user.displayAvatarURL()
            })
            // InfractionSearchNext.ts relies on this format
            .setFooter({ text: `User ID: ${user.id}` });

        const fields = Infraction._formatInfractionSearchFields(infractions);

        if (!fields.length) {
            embed.setDescription("No infractions found");
        } else {
            embed.setFields(fields);
        }

        const paginationComponents: ActionRowBuilder<ButtonBuilder>[] = [];

        if (infractionCount > RESULTS_PER_PAGE) {
            const totalPageCount = Math.ceil(infractionCount / RESULTS_PER_PAGE);
            const paginationActionRow = Infraction._getPaginationActionRow({
                page,
                totalPageCount,
                paginationButtonCustomIdPrefix: "infraction-search"
            });

            paginationComponents.push(paginationActionRow);
        }

        return {
            embeds: [embed],
            components: paginationComponents
        };
    }

    private static _formatInfractionSearchFields(infractions: InfractionPayload[], includeTargetEntry = false): APIEmbedField[] {
        return infractions.map(infraction => {
            const cleanContent = InfractionUtil.formatReasonPreview(infraction.reason ?? DEFAULT_INFRACTION_REASON);
            const croppedContent = elipsify(cleanContent, 800);
            const contentType = infraction.flag === InfractionFlag.Quick ? "Message" : "Reason";

            const entries = [
                Infraction._formatInfractionSearchEntry("Created", time(infraction.created_at, TimestampStyles.RelativeTime)),
                Infraction._formatInfractionSearchEntry("Executor", userMention(infraction.executor_id)),
                Infraction._formatInfractionSearchEntry(contentType, croppedContent)
            ];

            if (includeTargetEntry) {
                const entry = Infraction._formatInfractionSearchEntry("Target", userMention(infraction.target_id));
                entries.splice(1, 0, entry);
            }

            if (infraction.expires_at) {
                const durationEntry = Infraction._parseInfractionSearchDurationEntry(infraction.expires_at, infraction.created_at);
                entries.splice(1, 0, durationEntry);
            }

            const fieldTitle = InfractionUtil.formatAction(infraction.action, infraction.flag);

            return {
                name: `${fieldTitle} #${infraction.id}`,
                value: entries.join("\n")
            };
        });
    }

    /** @returns Database query conditions */
    private static _parseSearchFilter(filter?: InfractionSearchFilter): Prisma.InfractionWhereInput {
        switch (filter) {
            case InfractionSearchFilter.Infractions:
                return {
                    action: { not: InfractionAction.Note },
                    archived_at: null,
                    archived_by: null
                };

            case InfractionSearchFilter.Manual:
                return {
                    flag: { not: InfractionFlag.Automatic },
                    action: { not: InfractionAction.Note },
                    archived_at: null,
                    archived_by: null
                };

            case InfractionSearchFilter.Automatic:
                return {
                    flag: InfractionFlag.Automatic,
                    action: { not: InfractionAction.Note },
                    archived_at: null,
                    archived_by: null
                };

            case InfractionSearchFilter.Archived:
                return {
                    archived_at: { not: null },
                    archived_by: { not: null }
                };

            case InfractionSearchFilter.Notes:
                return {
                    action: InfractionAction.Note,
                    archived_at: null,
                    archived_by: null
                };

            default:
                return {
                    archived_at: null,
                    archived_by: null
                };
        }
    }

    /**
     * Parses an infraction's expiration date for display
     *
     * @param expiresAt - When the infraction expires
     * @param createdAt - When the infraction was created
     * @returns A timestamp if the expiration date in the future, a static string otherwise
     * @private
     */
    private static _parseInfractionSearchDurationEntry(expiresAt: Date, createdAt: Date): ReturnType<typeof Infraction._formatInfractionSearchEntry> {
        const msExpiresAt = expiresAt.getTime();
        const msDuration = expiresAt.getTime() - createdAt.getTime();

        return msExpiresAt > Date.now()
            ? Infraction._formatInfractionSearchEntry("Expires", time(expiresAt, TimestampStyles.RelativeTime))
            : Infraction._formatInfractionSearchEntry("Duration", humanizeTimestamp(msDuration));
    }

    private static _formatInfractionSearchEntry(name: string, value: string): `> \`${string}\` | ${string}` {
        return `> \`${name}\` | ${value}`;
    }

    private static _getPaginationActionRow(data: {
        page: number,
        totalPageCount: number,
        paginationButtonCustomIdPrefix: string,
    }): ActionRowBuilder<ButtonBuilder> {
        const { page, totalPageCount, paginationButtonCustomIdPrefix } = data;

        const isFirstPage = page === 1;
        const isLastPage = page === totalPageCount;

        const pageCountButton = new ButtonBuilder()
            .setLabel(`${page} / ${totalPageCount}`)
            .setCustomId("disabled")
            .setDisabled(true)
            .setStyle(ButtonStyle.Secondary);

        const nextPageButton = new ButtonBuilder()
            .setLabel("→")
            .setCustomId(`${paginationButtonCustomIdPrefix}-next`)
            .setDisabled(isLastPage)
            .setStyle(ButtonStyle.Primary);

        const previousPageButton = new ButtonBuilder()
            .setLabel("←")
            .setCustomId(`${paginationButtonCustomIdPrefix}-back`)
            .setDisabled(isFirstPage)
            .setStyle(ButtonStyle.Primary);

        if (totalPageCount > 2) {
            const firstPageButton = new ButtonBuilder()
                .setLabel("«")
                .setCustomId(`${paginationButtonCustomIdPrefix}-first`)
                .setDisabled(isFirstPage)
                .setStyle(ButtonStyle.Primary);

            const lastPageButton = new ButtonBuilder()
                .setLabel("»")
                .setCustomId(`${paginationButtonCustomIdPrefix}-last`)
                .setDisabled(isLastPage)
                .setStyle(ButtonStyle.Primary);

            return new ActionRowBuilder<ButtonBuilder>()
                .setComponents(firstPageButton, previousPageButton, pageCountButton, nextPageButton, lastPageButton);
        } else {
            return new ActionRowBuilder<ButtonBuilder>()
                .setComponents(previousPageButton, pageCountButton, nextPageButton);
        }
    }
}

enum InfractionSubcommand {
    Search = "search",
    Info = "info",
    Duration = "duration",
    Reason = "reason",
    Archive = "archive",
    Restore = "restore",
    Active = "active",
    Transfer = "transfer"
}