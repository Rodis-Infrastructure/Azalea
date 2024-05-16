import { ButtonInteraction, GuildMember, roleMention } from "discord.js";
import { InteractionReplyData } from "@utils/types";
import { prisma } from "./..";
import { pluralize } from "@/utils";
import { Permission } from "@managers/config/schema";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";

export default class RoleRequestRemoveRole extends Component {
    constructor() {
        super("role-request-remove-role");
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (!config.hasPermission(interaction.member, Permission.ManageRoleRequests)) {
            return "You do not have permission to manage role requests.";
        }

        const [embed] = interaction.message.embeds;

        // Footer format: "Role ID: 123456789012345678"
        const roleId = embed.footer!.text.split(": ")[1];
        const userIdMatches = embed.description!.matchAll(/@(\d{17,19})/g);
        const userIds = Array.from(userIdMatches).map(capture => capture[1]);
        const members = await interaction.guild.members.fetch({ user: userIds });

        const failedMembers: GuildMember[] = [];

        for (const member of members.values()) {
            await Promise.all([
                member.roles.remove(roleId).catch(() => failedMembers.push(member)),
                prisma.temporaryRole.delete({
                    where: {
                        member_id_role_id_guild_id: {
                            member_id: member.id,
                            guild_id: member.guild.id,
                            role_id: roleId
                        }
                    }
                })
            ]).catch(() => null);
        }

        let response: string;

        if (failedMembers.length) {
            const formattedMembers = failedMembers.map(member => member.toString()).join(", ");
            response = `Failed to remove ${roleMention(roleId)} from the following ${pluralize(failedMembers.length, "member")}: ${formattedMembers}`;
        } else {
            response = `Successfully removed ${roleMention(roleId)} from \`${members.size}\` ${pluralize(members.size, "member")}!`;
        }

        await interaction.reply({
            content: response,
            allowedMentions: { parse: [] },
            ephemeral: true
        });

        await interaction.message.delete().catch(() => null);
        return null;
    }
}