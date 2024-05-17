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
    DEFAULT_INFRACTION_REASON,
    DEFAULT_MUTE_DURATION,
    EMBED_FIELD_CHAR_LIMIT,
    MAX_MUTE_DURATION
} from "@utils/constants";

import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { Prisma, Infraction as InfractionPayload } from "@prisma/client";
import { elipsify, humanizeTimestamp, stripLinks, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { Action, getActionColor, parseInfractionType, Flag } from "@utils/infractions";

import GuildConfig from "@managers/config/GuildConfig";
import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";
import ms from "ms";

// Filter infraction search results
export enum InfractionSearchFilter {
    // Show all infractions, including automatic ones
    All = "All",
    // Only show automatic infractions
    Automatic = "Automatic",
    // Only show non-automatic infractions (default)
    Manual = "Manual",
    // Only show archived infractions
    Archived = "Archived"
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
                            description: "The filter to apply to the search (excludes automatic infractions by default)",
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

    execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const subcommand = interaction.options.getSubcommand(true);
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
                    return Promise.resolve("You do not have permission to view this user's infractions");
                }

                const user = member?.user ?? interaction.options.getUser("user", true);
                const filter = interaction.options.getString("filter") as InfractionSearchFilter | null ?? InfractionSearchFilter.All;

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

            case InfractionSubcommand.Archive: {
                const infractionId = interaction.options.getInteger("infraction_id", true);
                return Infraction._archive(infractionId, interaction.member, config);
            }

            case InfractionSubcommand.Restore: {
                const infractionId = interaction.options.getInteger("infraction_id", true);

                if (!config.hasPermission(interaction.member, Permission.ManageInfractions)) {
                    return Promise.resolve("You do not have permission to restore infractions.");
                }

                return Infraction._restore(infractionId, interaction.user.id, config);
            }

            case InfractionSubcommand.Info: {
                const infractionId = interaction.options.getInteger("infraction_id", true);
                return Infraction._info(infractionId, interaction.guildId);
            }

            default: {
                return Promise.resolve("Unknown subcommand");
            }
        }
    }

    /**
     * Get a detailed overview of an infraction
     *
     * @param infractionId - ID of the infraction to view the details of
     * @param guildId - ID of the guild the infraction was given in
     * @returns An interaction reply with the result of the operation
     * @private
     */
    private static async _info(infractionId: number, guildId: Snowflake): Promise<InteractionReplyData> {
        const infraction = await prisma.infraction.findUnique({
            where: {
                id: infractionId,
                guild_id: guildId
            }
        });

        if (!infraction) {
            return `Infraction with ID \`#${infractionId}\` not found.`;
        }

        const embedColor = getActionColor(infraction.action);
        const embedTitle = parseInfractionType(infraction.action, infraction.flag);

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(embedTitle)
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

        // Append the expiration timestamp to the embed title
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
            // Insert the request author field after the "Executor" field
            embed.addFields({
                name: "Requested By",
                value: userMentionWithId(infraction.request_author_id)
            });
        }

        // List of modification made to the infraction
        const changes: string[] = [];

        // The infraction's reason/duration was modified
        if (infraction.updated_at && infraction.updated_by) {
            const timestamp = time(infraction.updated_at, TimestampStyles.RelativeTime);
            changes.push(`- Updated ${timestamp} by ${userMention(infraction.updated_by)}`);
        }

        // The infraction was archived
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
            return `Infraction with ID \`#${infractionId}\` not found.`;
        }

        // Check whether the executor has permission to manage infractions
        if (infraction.executor_id !== executor.id && !config.hasPermission(executor, Permission.ManageInfractions)) {
            return "You do not have permission to archive this infraction.";
        }

        // Check whether the infraction is active (if it's temporary)
        if (infraction.expires_at && infraction.expires_at > new Date()) {
            return "Cannot archive an active infraction.";
        }

        await prisma.infraction.update({
            where: { id: infractionId },
            data: {
                archived_at: new Date(),
                archived_by: executor.id
            }
        });

        const embedTitle = parseInfractionType(infraction.action, infraction.flag);
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Infraction Archived" })
            .setTitle(embedTitle)
            .setFields([{
                name: "Archived By",
                value: userMentionWithId(executor.id)
            }])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp();

        await log({
            event: LoggingEvent.InfractionArchive,
            message: { embeds: [embed] },
            channel: null,
            config
        });

        return `Successfully archived infraction \`#${infractionId}\``;
    }

    /**
     * Restores an archived infraction by:
     *
     * - Updating the infraction's archived status in the database.
     * - Logging the restoration in the appropriate channel.
     *
     * @param infractionId - ID of the infraction to restore
     * @param executorId - ID of the user responsible for restoring the infraction
     * @param config - The guild configuration
     * @returns An interaction reply with the result of the operation
     * @private
     */
    private static async _restore(infractionId: number, executorId: Snowflake, config: GuildConfig): Promise<InteractionReplyData> {
        const infraction = await prisma.infraction.findUnique({
            where: { id: infractionId, archived_at: { not: null } },
            select: { action: true, flag: true }
        });

        if (!infraction) {
            return `Archived infraction with ID \`#${infractionId}\` not found.`;
        }

        await prisma.infraction.update({
            where: { id: infractionId },
            data: {
                archived_at: null,
                archived_by: null
            }
        });

        const embedTitle = parseInfractionType(infraction.action, infraction.flag);
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Infraction Restored" })
            .setTitle(embedTitle)
            .setFields([{
                name: "Restored By",
                value: userMentionWithId(executorId)
            }])
            .setFooter({ text: `#${infractionId}` })
            .setTimestamp();

        await log({
            event: LoggingEvent.InfractionRestore,
            message: { embeds: [embed] },
            channel: null,
            config
        });

        return `Successfully restored infraction \`#${infractionId}\``;
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
                action: Action.Mute,
                expires_at: { gt: new Date() }
            },
            select: {
                reason: true,
                executor_id: true,
                created_at: true,
                expires_at: true,
                target_id: true
            }
        }).catch(() => null);

        if (!oldState) {
            return `Active mute with ID \`#${infractionId}\` not found.`;
        }

        // Ensure the executor is either the original executor or has permission to manage infractions
        if (oldState.executor_id !== executor.id && !config.hasPermission(executor, Permission.ManageInfractions)) {
            return "You do not have permission to update the duration of this mute.";
        }

        const member = await config.guild.members
            .fetch(oldState.target_id)
            .catch(() => null);

        if (!member) {
            return "Unable to change the mute duration, the user is no longer in the server.";
        }

        let msDuration = ms(duration);

        if (!msDuration || msDuration < 0) {
            return "Invalid duration provided. Please provide a valid duration.";
        }

        // Prevent the duration from exceeding the threshold
        if (msDuration > MAX_MUTE_DURATION) msDuration = DEFAULT_MUTE_DURATION;

        await member.timeout(msDuration, `Duration change of infraction #${infractionId}`);
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
        const embedTitle = parseInfractionType(Action.Mute, newState.flag);

        const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setAuthor({ name: "Infraction Duration Changed" })
            .setTitle(embedTitle)
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

        await log({
            event: LoggingEvent.InfractionUpdate,
            message: { embeds: [embed] },
            channel: null,
            config
        });

        return `Successfully updated the duration of infraction \`#${infractionId}\` (expires ${time(expiresAt, TimestampStyles.RelativeTime)})`;
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
            select: { reason: true, executor_id: true, flag: true }
        }).catch(() => null);

        if (!oldState) {
            return `Infraction with ID \`#${infractionId}\` not found.`;
        }

        // Ensure the executor is either the original executor or has permission to manage infractions
        if (oldState.executor_id !== executor.id && !config.hasPermission(executor, Permission.ManageInfractions)) {
            return "You do not have permission to update the reason of this infraction.";
        }

        const newState = await prisma.infraction.update({
            where: { id: infractionId },
            select: { action: true, flag: true },
            data: {
                updated_at: new Date(),
                updated_by: executor.id,
                flag: oldState.flag === Flag.Quick ? 0 : undefined,
                reason
            }
        });

        const embedTitle = parseInfractionType(newState.action, newState.flag);
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setAuthor({ name: "Infraction Reason Changed" })
            .setTitle(embedTitle)
            .setFields([
                {
                    name: "Updated By",
                    value: userMentionWithId(executor.id)
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

        await log({
            event: LoggingEvent.InfractionUpdate,
            message: { embeds: [embed] },
            channel: null,
            config
        });

        return `Successfully updated the reason of infraction \`#${infractionId}\` (\`${reason}\`)`;
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

        const infractions = await prisma.infraction.findMany({
            skip: skipMultiplier * RESULTS_PER_PAGE,
            take: RESULTS_PER_PAGE,
            where: {
                target_id: user.id,
                guild_id: guildId,
                archived_by: null,
                archived_at: null,
                ...queryConditions
            },
            orderBy: {
                id: "desc"
            }
        });

        const embed = new EmbedBuilder()
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

        const infractionCount = await prisma.infraction.count({
            where: {
                target_id: user.id,
                guild_id: guildId,
                ...queryConditions
            }
        });

        const components: ActionRowBuilder<ButtonBuilder>[] = [];

        // Add pagination if there are more results than can be displayed
        if (infractionCount > RESULTS_PER_PAGE) {
            const totalPageCount = Math.ceil(infractionCount / RESULTS_PER_PAGE);

            const pageCountButton = new ButtonBuilder()
                // InfractionSearchNext.ts relies on this format
                .setLabel(`${page} / ${totalPageCount}`)
                .setCustomId("disabled")
                .setDisabled(true)
                .setStyle(ButtonStyle.Secondary);

            const nextPageButton = new ButtonBuilder()
                .setLabel("Next")
                .setCustomId("infraction-search-next")
                // Disable if the current page is the last page
                .setDisabled(page === totalPageCount)
                .setStyle(ButtonStyle.Primary);

            const previousPageButton = new ButtonBuilder()
                .setLabel("Back")
                .setCustomId("infraction-search-back")
                // Disable if the current page is the first page
                .setDisabled(page === 1)
                .setStyle(ButtonStyle.Primary);

            const buttonActionRow = new ActionRowBuilder<ButtonBuilder>()
                .setComponents(previousPageButton, pageCountButton, nextPageButton);

            components.push(buttonActionRow);
        }

        return {
            embeds: [embed],
            components
        };
    }

    private static _formatInfractionSearchFields(infractions: InfractionPayload[]): APIEmbedField[] {
        return infractions.map(infraction => {
            const cleanReason = stripLinks(infraction.reason ?? DEFAULT_INFRACTION_REASON);
            const croppedReason = elipsify(cleanReason, 800);

            const entries = [
                Infraction._formatInfractionSearchEntry("Created", time(infraction.created_at, TimestampStyles.RelativeTime)),
                Infraction._formatInfractionSearchEntry("Executor", userMention(infraction.executor_id)),
                Infraction._formatInfractionSearchEntry("Reason", croppedReason)
            ];

            if (infraction.expires_at) {
                const durationEntry = Infraction._parseInfractionSearchDurationEntry(infraction.expires_at, infraction.created_at);
                // Insert the duration entry after the "Created" entry
                entries.splice(1, 0, durationEntry);
            }

            const fieldTitle = parseInfractionType(infraction.action, infraction.flag);

            return {
                // Format: Action #ID
                name: `${fieldTitle} #${infraction.id}`,
                value: entries.join("\n")
            };
        });
    }

    /** @returns Database query conditions */
    private static _parseSearchFilter(filter?: InfractionSearchFilter): Prisma.InfractionWhereInput {
        switch (filter) {
            case InfractionSearchFilter.Manual:
                return { flag: { not: Flag.Automatic } };

            case InfractionSearchFilter.Automatic:
                return { flag: Flag.Automatic };

            case InfractionSearchFilter.Archived:
                return {
                    archived_at: { not: null },
                    archived_by: { not: null }
                };

            default:
                return {};
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
        const msTimestamp = expiresAt.getTime();
        const msDuration = expiresAt.getTime() - createdAt.getTime();
        const timestamp = Math.floor(msTimestamp / 1000);

        return msTimestamp > Date.now()
            ? Infraction._formatInfractionSearchEntry("Expires", time(timestamp, TimestampStyles.RelativeTime))
            : Infraction._formatInfractionSearchEntry("Duration", humanizeTimestamp(msDuration));
    }

    private static _formatInfractionSearchEntry(name: string, value: string): `> \`${string}\` | ${string}` {
        return `> \`${name}\` | ${value}`;
    }
}

enum InfractionSubcommand {
    Search = "search",
    Info = "info",
    Duration = "duration",
    Reason = "reason",
    Archive = "archive",
    Restore = "restore"
}