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
import { DEFAULT_EMBED_COLOR } from "@utils/constants";
import { userMentionWithId } from "@/utils";

import Component from "@managers/components/Component";

export default class RoleMembers extends Component {
    constructor() {
        // Format: role-members-{requiredRoleId}
        super({ matches: /role-members(-\d{17,19})?/g });
    }

    async execute(interaction: RoleSelectMenuInteraction<"cached">): Promise<InteractionReplyData> {
        const requiredRoleId = interaction.customId.split("-").at(2);
        const requiredRole = requiredRoleId
            ? await interaction.guild.roles.fetch(requiredRoleId)
            : null;

        const uniqueMembers = await RoleMembers.uniqueMembers(requiredRole, interaction.roles);

        if (uniqueMembers.size > 50) {
            return "The list of members is too long to display";
        }

        const mentions = uniqueMembers
            .map(({ id }) => userMentionWithId(id))
            .join("\n");

        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setDescription(mentions || "No members found");

        if (requiredRole) {
            embed.setColor(requiredRole.color);
            embed.setTitle(`Members with role @${requiredRole.name}`);
            embed.setFooter({ text: `Role ID: ${requiredRole.id}` });
        }

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
            content: null,
            embeds: [embed],
            components: [actionRow]
        });

        return null;
    }

    static async uniqueMembers(requiredRole: Role | null, optionalRoles: Collection<Snowflake, Role>): Promise<Collection<Snowflake, GuildMember>> {
        return requiredRole
            ? optionalRoles.flatMap(role => role.members.intersect(requiredRole.members))
            : optionalRoles.flatMap(role => role.members);
    }
}