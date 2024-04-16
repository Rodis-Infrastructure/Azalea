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
    Snowflake
} from "discord.js";

import { Action, InteractionReplyData } from "@utils/types";
import { BLANK_EMBED_FIELD, EMPTY_INFRACTION_REASON } from "@utils/constants";
import { prisma } from "./..";

import Command from "@managers/commands/Command";
import GuildConfig, { Permission, UserFlag } from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";

export default class UserInfo extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "user-info",
            description: "Get information about a user",
            options: [{
                name: "user",
                type: ApplicationCommandOptionType.User,
                description: "The user to get information about",
                required: true
            }]
        });
    }

    async execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const member = interaction.options.getMember("user");
        const user = member?.user ?? interaction.options.getUser("user", true);
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        const displayedName = member?.nickname
            ? `Nickname: ${member.nickname}`
            : `Display name: ${user.displayName}`;

        const embed = new EmbedBuilder()
            .setAuthor({
                name: displayedName,
                iconURL: user.displayAvatarURL(),
                url: user.displayAvatarURL()
            })
            .setFields({
                name: "Created",
                value: time(user.createdAt, TimestampStyles.RelativeTime),
                inline: true
            })
            .setFooter({ text: `ID: ${user.id}` });

        // Add the member's join date if available
        if (member?.joinedAt) {
            embed.addFields({
                name: "Joined",
                value: time(member.joinedAt, TimestampStyles.RelativeTime),
                inline: true
            });
        }

        const isBanned = await interaction.guild.bans
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
                    guild_id: interaction.guildId
                }
            }) ?? {
                reason: EMPTY_INFRACTION_REASON
            };

            embed.setColor(Colors.Red);
            embed.setTitle("Banned");
            embed.setDescription(reason);
        } else if (!member) {
            embed.setColor(Colors.Red);
            embed.setTitle("Not in server");
        }

        const flags = this.getUserFlags(member, user, config);

        if (flags.length) {
            const formattedFlags = flags
                .map(inlineCode)
                .join(" ");

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

        let ephemeral = interaction.channel
            ? config.inScope(interaction.channel, config.data.ephemeral_scoping)
            : true;

        // Executor has permission to view infractions
        if (config.hasPermission(interaction.member, Permission.ViewInfractions)) {
            await this.getUserInfractionsReceived(embed, user.id, interaction.guildId);

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
            config.hasPermission(interaction.member, Permission.ViewModerationActivity) &&
            member && config.hasPermission(member, Permission.ViewInfractions)
        ) {
            await this.getUserInfractionsDealt(embed, user.id, interaction.guildId);

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
    private async getUserInfractionsReceived(embed: EmbedBuilder, userId: Snowflake, guildId: Snowflake): Promise<void> {
        const infractions = await prisma.$queryRaw<InfractionCount>`
            SELECT SUM(action = ${Action.Ban})  as ban_count,
                   SUM(action = ${Action.Kick}) as kick_count,
                   SUM(action = ${Action.Mute}) as mute_count,
                   SUM(action = ${Action.Note}) as note_count
            FROM Infraction
            WHERE target_id = ${userId}
              AND guild_id = ${guildId};
        `;


        embed.addFields({
            name: "Infractions Received",
            inline: embed.data.fields!.length >= 3,
            value: `Bans: \`${infractions.ban_count ?? 0}\`\n`
                + `Kicks: \`${infractions.kick_count ?? 0}\`\n`
                + `Mutes: \`${infractions.mute_count ?? 0}\`\n`
                + `Notes: \`${infractions.note_count ?? 0}\``
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
    private async getUserInfractionsDealt(embed: EmbedBuilder, userId: Snowflake, guildId: Snowflake): Promise<void> {
        const infractions = await prisma.$queryRaw<InfractionCount>`
            SELECT SUM(action = ${Action.Ban})  as ban_count,
                   SUM(action = ${Action.Kick}) as kick_count,
                   SUM(action = ${Action.Mute}) as mute_count,
                   SUM(action = ${Action.Note}) as note_count
            FROM Infraction
            WHERE (executor_id = ${userId} or request_author_id = ${userId})
              AND guild_id = ${guildId};
        `;

        embed.addFields({
            name: "Infractions Dealt",
            inline: embed.data.fields!.length >= 3,
            value: `Bans: \`${infractions.ban_count ?? 0}\`\n`
                + `Kicks: \`${infractions.kick_count ?? 0}\`\n`
                + `Mutes: \`${infractions.mute_count ?? 0}\`\n`
                + `Notes: \`${infractions.note_count ?? 0}\``
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
    private getUserFlags(member: GuildMember | null, user: User, config: GuildConfig): string[] {
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

interface InfractionCount {
    ban_count: bigint | null;
    kick_count: bigint | null;
    mute_count: bigint | null;
    note_count: bigint | null;
}