import { InteractionReplyData } from "@utils/types";
import { EmbedBuilder, GuildMember, StringSelectMenuInteraction, time, userMention } from "discord.js";
import { prisma } from "./..";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";

export default class RoleRequestSelectRole extends Component {
    constructor() {
        super("role-request-select-role");
    }

    async execute(interaction: StringSelectMenuInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const roleRequestConfig = config.data.role_requests!;
        const canManageRoleRequests = roleRequestConfig.reviewer_roles.some(roleId =>
            interaction.member.roles.cache.has(roleId)
        );

        if (!canManageRoleRequests) {
            return {
                content: "You do not have permission to manage role requests.",
                ephemeral: true
            };
        }

        const [selected] = interaction.values;
        const selectedRole = roleRequestConfig.roles
            .find(role => role.id === selected);

        if (!selectedRole) {
            return {
                content: "This role is not available for request.",
                ephemeral: true
            };
        }

        const role = await interaction.guild.roles.fetch(selectedRole.id);

        if (!role) {
            return {
                content: "Failed to fetch the role.",
                ephemeral: true
            };
        }

        const userIdMatches = interaction.message.embeds[0].description!
            .matchAll(/@(\d{17,19})/g);

        const userIds = Array.from(userIdMatches, match => match[1]);
        // Fetch the members that are mentioned in the embed
        const memberPromises = userIds.map(userId =>
            interaction.guild.members
                .fetch(userId)
                .catch(() => null)
        );

        const nullableMembers = await Promise.all(memberPromises);
        const members = nullableMembers.filter(Boolean) as GuildMember[];
        const buttonActionRow = interaction.message.components[1];
        const [embedData] = interaction.message.embeds;

        const embed = new EmbedBuilder(embedData.toJSON())
            .setColor(role.color)
            .setTitle(role.name);

        // Store the role expiration time in the database
        if (selectedRole.ttl) {
            const expiresAt = new Date(Date.now() + selectedRole.ttl);
            const isTransactionSuccessful = await prisma.$transaction(members.map(member =>
                prisma.roleRequest.upsert({
                    where: {
                        guild_id: interaction.guildId,
                        member_id_role_id: {
                            member_id: member.id,
                            role_id: selectedRole.id
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
            ))
                .then(() => true)
                .catch(() => false);

            if (!isTransactionSuccessful) {
                return {
                    content: "Failed to start expiration timers.",
                    ephemeral: true
                };
            }

            embed.data.title += ` (expires ${time(expiresAt)})`;
        }

        // Add the role to the members
        const addedMembers = await Promise.all(members.map(member =>
            member.roles.add(
                selectedRole.id,
                `Role request approved by @${interaction.user.username} (${interaction.user.id})`
            ).catch(() => null)
        ));

        const successfulMembers = addedMembers.filter(Boolean) as GuildMember[];

        await interaction.update({
            embeds: [embed],
            components: [buttonActionRow]
        });

        if (successfulMembers.length !== userIds.length) {
            const failedMembers = userIds
                .filter(userId => !members.some(member => member.id === userId))
                .map(userId => userMention(userId))
                .join(" ");

            await interaction.followUp({
                content: `Failed to assign the role to the following members: ${failedMembers}`,
                ephemeral: true
            });

            return null;
        }

        await interaction.followUp({
            content: `Successfully assigned the role to ${members.length} members.`,
            ephemeral: true
        });

        return null;
    }
}