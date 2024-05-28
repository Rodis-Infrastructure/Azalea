import {
    ApplicationCommandOptionType,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Colors,
    EmbedBuilder,
    GuildMember,
    inlineCode,
    time,
    TimestampStyles,
    User,
    Snowflake,
    GuildTextBasedChannel,
    InteractionReplyOptions
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { BLANK_EMBED_FIELD, DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { prisma } from "./..";
import { Permission, UserFlag } from "@managers/config/schema";
import { Action } from "@utils/infractions";

import Command from "@managers/commands/Command";
import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";

export default class UserInfo extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "user",
            description: "Get information about a user",
            options: [{
                name: "info",
                description: "Get information about a user",
                type: ApplicationCommandOptionType.Subcommand,
                options: [{
                    name: "user",
                    type: ApplicationCommandOptionType.User,
                    description: "The user to get information about",
                    required: true
                }]
            }]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const member = interaction.options.getMember("user");
        const user = interaction.options.getUser("user", true);
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        return UserInfo.get({
            channel: interaction.channel,
            executor: interaction.member,
            config,
            member,
            user
        });
    }

    /**
     * Get information about a user
     *
     * @param data.member - The target member (for role checks)
     * @param data.user - The target user
     * @param data.config - The guild configuration
     * @param data.channel - The channel the command was executed in
     * @param data.executor - The executor of the command
     * @returns An interaction reply with the user's information
     */
    static async get(data: {
        member: GuildMember | null;
        user: User;
        config: GuildConfig;
        channel: GuildTextBasedChannel | null;
        executor: GuildMember;
    }): Promise<InteractionReplyOptions> {
        const { member, user, config, channel, executor } = data;
        const surfaceName = member?.nickname ?? user.displayName;

        const embed = new EmbedBuilder()
            .setAuthor({
                name: `@${user.username} | ${surfaceName}`,
                iconURL: user.displayAvatarURL(),
                url: user.displayAvatarURL()
            })
            .setFields({
                name: "Created",
                value: time(user.createdAt, TimestampStyles.RelativeTime),
                inline: true
            })
            .setFooter({ text: `User ID: ${user.id}` });

        // Add the member's join date if available
        if (member?.joinedAt) {
            embed.addFields({
                name: "Joined",
                value: time(member.joinedAt, TimestampStyles.RelativeTime),
                inline: true
            });
        }

        const isBanned = await config.guild.bans
            .fetch(user.id)
            .then(() => true)
            .catch(() => false);

        if (isBanned) {
            // Fetch the infraction from the database
            // in order to get the most up-to-date reason
            const { reason } = await prisma.infraction.findFirst({
                select: {
                    reason: true
                },
                where: {
                    action: Action.Ban,
                    target_id: user.id,
                    guild_id: config.guild.id
                }
            }) ?? {
                reason: DEFAULT_INFRACTION_REASON
            };

            embed.setColor(Colors.Red);
            embed.setTitle("Banned");
            embed.setDescription(reason);
        } else if (!member) {
            embed.setColor(Colors.Red);
            embed.setTitle("Not in server");
        }

        const flags = UserInfo._getFlags(member, user, config);

        if (flags.length) {
            const formattedFlags = flags
                .map(inlineCode)
                .join("\n");

            embed.addFields({
                name: "Flags",
                value: formattedFlags,
                inline: true
            });
        }

        // Add empty fields to complete row (for a better layout)
        const blankFields = Array(3 - embed.data.fields!.length)
            .fill(BLANK_EMBED_FIELD);

        embed.addFields(blankFields);

        const components: ActionRowBuilder<ButtonBuilder>[] = [];

        let ephemeral = channel
            ? config.inScope(channel, config.data.ephemeral_scoping)
            : true;

        // Executor has permission to view infractions
        if (config.hasPermission(executor, Permission.ViewInfractions) && (!member || !config.hasPermission(member, Permission.ViewInfractions))) {
            await UserInfo._getReceivedInfractions(embed, user.id, config.guild.id);

            const infractionSearchButton = new ButtonBuilder()
                .setLabel("Infractions")
                .setCustomId(`infraction-search-${user.id}`)
                .setStyle(ButtonStyle.Secondary);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .setComponents(infractionSearchButton);

            components.push(buttonRow);
        }

        // Executor has permission to view moderation activity
        // Target has permission to view infractions (staff)
        if (
            config.hasPermission(executor, Permission.ViewModerationActivity) &&
            member && config.hasPermission(member, Permission.ViewInfractions)
        ) {
            await UserInfo._getDealtInfractions(embed, user.id, config.guild.id);

            // Only allow the executor to view the moderation activity
            ephemeral = true;
        }

        return {
            embeds: [embed],
            components,
            ephemeral
        };
    }

    /**
     * Appends an infraction count field to the passed embed
     *
     * @param embed - The embed to append the field to
     * @param userId - ID of the user to count infractions for
     * @param guildId - The source guild's ID
     * @private
     */
    private static async _getReceivedInfractions(embed: EmbedBuilder, userId: Snowflake, guildId: Snowflake): Promise<void> {
        const [infractions] = await prisma.$queryRaw<InfractionCount[]>`
            SELECT SUM(action = ${Action.Ban})  as ban_count,
                   SUM(action = ${Action.Kick}) as kick_count,
                   SUM(action = ${Action.Mute}) as mute_count,
                   SUM(action = ${Action.Warn}) as warn_count
            FROM Infraction
            WHERE target_id = ${userId}
              AND guild_id = ${guildId}
              AND archived_at IS NULL
              AND archived_by IS NULL;
        `;

        embed.addFields({
            name: "Infractions Received",
            inline: embed.data.fields!.length >= 3,
            value: `Bans: \`${infractions.ban_count ?? 0}\`\n`
                + `Kicks: \`${infractions.kick_count ?? 0}\`\n`
                + `Mutes: \`${infractions.mute_count ?? 0}\`\n`
                + `Warns: \`${infractions.warn_count ?? 0}\``
        });
    }

    /**
     * Appends an infraction count field to the passed embed
     *
     * @param embed - The embed to append the field to
     * @param userId - ID of the user to count infractions for
     * @param guildId - The source guild's ID
     * @private
     */
    private static async _getDealtInfractions(embed: EmbedBuilder, userId: Snowflake, guildId: Snowflake): Promise<void> {
        const [infractions] = await prisma.$queryRaw<InfractionCount[]>`
            SELECT SUM(action = ${Action.Ban})  as ban_count,
                   SUM(action = ${Action.Kick}) as kick_count,
                   SUM(action = ${Action.Mute}) as mute_count,
                   SUM(action = ${Action.Warn}) as warn_count
            FROM Infraction
            WHERE (executor_id = ${userId} or request_author_id = ${userId})
              AND guild_id = ${guildId}
              AND archived_at IS NULL
              AND archived_by IS NULL;
        `;

        embed.addFields({
            name: "Infractions Dealt",
            inline: embed.data.fields!.length >= 3,
            value: `Bans: \`${infractions.ban_count ?? 0}\`\n`
                + `Kicks: \`${infractions.kick_count ?? 0}\`\n`
                + `Mutes: \`${infractions.mute_count ?? 0}\`\n`
                + `Warns: \`${infractions.warn_count ?? 0}\``
        });
    }

    /**
     * Get all flags for a user
     *
     * @param member - The member instance (for role checks)
     * @param user - The user instance (for default flags)
     * @param config - The guild configuration
     * @returns An array of flags
     * @private
     */
    private static _getFlags(member: GuildMember | null, user: User, config: GuildConfig): string[] {
        const flags: string[] = [];

        if (member) {
            if (member.isCommunicationDisabled()) {
                flags.push("Muted");
            }

            const hasFlag = (flag: UserFlag): boolean => {
                return flag.roles.some(role => member.roles.cache.has(role));
            };

            // Check if the user has any custom flags, return all applicable ones
            config.data.user_flags
                .filter(hasFlag)
                .forEach(flag => flags.push(flag.label));
        }

        if (user.bot) {
            flags.push("Bot");
        }

        return flags;
    }
}


export interface InfractionCount {
    ban_count: bigint | null;
    kick_count: bigint | null;
    mute_count: bigint | null;
    warn_count: bigint | null;
}