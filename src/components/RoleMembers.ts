import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Collection,
    EmbedBuilder,
    GuildMember,
    Role,
    RoleSelectMenuInteraction,
    Snowflake
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { userMentionWithId } from "@/utils";
import { Permission } from "@managers/config/schema";

import Component from "@managers/components/Component";
import ConfigManager from "@managers/config/ConfigManager";

export const MAX_MEMBERS = 80;

export default class RoleMembers extends Component {
    constructor() {
        // Format: role-members-{requiredRoleId}
        super({ matches: /role-members(-\d{17,19})?/g });
    }

    async execute(interaction: RoleSelectMenuInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (!config.hasPermission(interaction.member, Permission.ManageRoles)) {
            return "You do not have permission to select the roles.";
        }

        const requiredRoleId = interaction.customId.split("-").at(2);
        const requiredRole = requiredRoleId
            ? await interaction.guild.roles.fetch(requiredRoleId)
            : null;

        const uniqueMembers = RoleMembers.uniqueMembers(requiredRole, interaction.roles);

        if (uniqueMembers.size > MAX_MEMBERS) {
            return `I cannot display more than \`${MAX_MEMBERS}\` members at once.`;
        }

        const mentions = uniqueMembers
            .map(({ id }) => userMentionWithId(id))
            .join("\n");

        const embed = new EmbedBuilder(interaction.message.embeds[0].toJSON())
            .setDescription(mentions);

        const optionalRoleIds = interaction.roles
            .map((_, id) => id)
            .join("-");

        const refreshButton = new ButtonBuilder()
            .setCustomId(`role-members-refresh-${optionalRoleIds}`)
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary);

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(refreshButton);

        await interaction.update({
            embeds: [embed],
            components: [actionRow]
        });

        return null;
    }

    static uniqueMembers(requiredRole: Role | null, optionalRoles: Collection<Snowflake, Role>): Collection<Snowflake, GuildMember> {
        return requiredRole
            ? optionalRoles.flatMap(role => role.members.intersect(requiredRole.members))
            : optionalRoles.flatMap(role => role.members);
    }
}