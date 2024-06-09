import { InteractionReplyData } from "@utils/types";
import { ButtonInteraction, EmbedBuilder } from "discord.js";
import { userMentionWithId } from "@/utils";

import Component from "@managers/components/Component";
import RoleMembers from "@/components/RoleMembers";

export default class RoleMembersRefresh extends Component {
    constructor() {
        super({ startsWith: "role-members-refresh" });
    }

    async execute(interaction: ButtonInteraction<"cached">): Promise<InteractionReplyData> {
        const [embedData] = interaction.message.embeds;
        const embed = new EmbedBuilder(embedData.toJSON());

        const requiredRoleId = embedData.footer?.text.split(": ")[1];
        const requiredRole = requiredRoleId
            ? await interaction.guild.roles.fetch(requiredRoleId)
            : null;

        const optionalRoleIds = interaction.customId.split("-").slice(2);
        const roles = await interaction.guild.roles.fetch();
        const optionalRoles = roles.filter(({ id }) => optionalRoleIds.includes(id));
        const uniqueMembers = await RoleMembers.uniqueMembers(requiredRole, optionalRoles);

        if (uniqueMembers.size > 50) {
            return "The list of members is too long to display";
        }

        const mentions = uniqueMembers
            .map(({ id }) => userMentionWithId(id))
            .join("\n");

        embed.setDescription(mentions || "No members found");

        await interaction.update({ embeds: [embed] });
        return null;
    }
}