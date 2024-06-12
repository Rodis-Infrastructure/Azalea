import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    GuildMember,
    StringSelectMenuInteraction,
    time,
    TimestampStyles,
    userMention
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { pluralize } from "@/utils";
import { Permission } from "@managers/config/schema";
import { Prisma } from "@prisma/client";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";

export default class RoleRequestSelectRole extends Component {
    constructor() {
        super("role-request-select-role");
    }

    async execute(interaction: StringSelectMenuInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const roleRequestConfig = config.data.role_requests;

        if (!roleRequestConfig) {
            return {
                content: "Role requests are not enabled in this guild.",
                ephemeral: true,
                temporary: true
            };
        }

        if (!config.hasPermission(interaction.member, Permission.ManageRoleRequests)) {
            return {
                content: "You do not have permission to manage role requests.",
                ephemeral: true,
                temporary: true
            };
        }

        const [selected] = interaction.values;
        const selectedRole = roleRequestConfig.roles
            .find(role => role.id === selected);

        if (!selectedRole) {
            return {
                content: "This role is not available for request.",
                ephemeral: true,
                temporary: true
            };
        }

        const role = await interaction.guild.roles.fetch(selectedRole.id);

        if (!role) {
            return {
                content: "Failed to fetch the role.",
                ephemeral: true,
                temporary: true
            };
        }

        const [requestEmbed] = interaction.message.embeds;
        await interaction.deferUpdate();

        // Extract user IDs from the embed's description
        const userIdMatches = requestEmbed.description!
            .matchAll(/@(\d{17,19})/g);

        const userIds = Array.from(userIdMatches, match => match[1]);

        // Fetch the members that are mentioned in the embed
        const memberFetchPromises = userIds.map(userId =>
            interaction.guild.members
                .fetch(userId)
                .catch(() => null)
        );

        const nullableMembers = await Promise.all(memberFetchPromises);
        const members = nullableMembers.filter(Boolean) as GuildMember[];
        const buttonActionRow = new ActionRowBuilder<ButtonBuilder>(interaction.message.components[1].toJSON());

        const removeRolesButton = new ButtonBuilder()
            .setLabel("Remove role")
            .setStyle(ButtonStyle.Danger)
            .setCustomId("role-request-remove-role");

        buttonActionRow.addComponents(removeRolesButton);

        const embed = new EmbedBuilder(requestEmbed.toJSON())
            .setColor(role.color)
            .setTitle(role.name)
            // RoleRequestRemoveRole.ts relies on this format
            .setFooter({ text: `Role ID: ${role.id}` });

        // Store the role expiration time in the database
        if (selectedRole.ttl) {
            if (!interaction.channel) {
                await interaction.editReply({});
                await interaction.followUp({
                    content: "Failed to fetch channel",
                    ephemeral: true
                });
                return null;
            }

            const expiresAt = new Date(Date.now() + selectedRole.ttl);

            // Either create or update the role expiration time for each member
            const txn: Prisma.PrismaPromise<unknown>[] = members.map(member =>
                prisma.temporaryRole.upsert({
                    where: {
                        guild_id: interaction.guildId,
                        member_id_role_id_guild_id: {
                            member_id: member.id,
                            role_id: selectedRole.id,
                            guild_id: interaction.guildId
                        }
                    },
                    create: {
                        guild_id: interaction.guildId,
                        member_id: member.id,
                        role_id: selectedRole.id,
                        expires_at: expiresAt
                    },
                    update: {
                        expires_at: expiresAt
                    }
                })
            );

            // Remove the role request message after the role expires
            txn.push(
                prisma.temporaryMessage.create({
                    data: {
                        message_id: interaction.message.id,
                        channel_id: interaction.channel.id,
                        expires_at: expiresAt
                    }
                })
            );

            const isTransactionSuccessful = await prisma.$transaction(txn)
                .then(() => true)
                .catch(() => false);

            if (!isTransactionSuccessful) {
                await interaction.editReply({});
                await interaction.followUp({
                    content: `Failed to start expiration ${pluralize(members.length, "timer")}.`,
                    ephemeral: true
                });
                return null;
            }

            embed.data.title += ` (expires ${time(expiresAt, TimestampStyles.RelativeTime)})`;
        }

        // Add the role to the members
        const addedMembers = await Promise.all(members.map(member =>
            member.roles.add(
                selectedRole.id,
                `Role request approved by @${interaction.user.username} (${interaction.user.id})`
            ).catch(() => null)
        ));

        const successfulMembers = addedMembers.filter(Boolean) as GuildMember[];

        await interaction.editReply({
            embeds: [embed],
            components: [buttonActionRow]
        });

        // There was an issue assigned the role to some members
        if (successfulMembers.length !== userIds.length) {
            const failedMembers = userIds
                .filter(userId => !members.some(member => member.id === userId))
                .map(userId => userMention(userId))
                .join(" ");

            await interaction.followUp({
                content: `Failed to assign the role to the following ${pluralize(failedMembers.length, "member")}: ${failedMembers}`,
                ephemeral: true
            });
        } else {
            // The role was successfully assigned to all members
            await interaction.followUp({
                content: `Successfully assigned the role to ${members.length} ${pluralize(members.length, "member")}.`,
                ephemeral: true
            });
        }

        return null;
    }
}