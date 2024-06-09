import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    RoleSelectMenuBuilder,
    roleMention,
    Snowflake
} from "discord.js";

import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";

export default class Role extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "role",
            description: "Manage roles",
            options: [{
                name: RoleSubcommand.Members,
                description: "List all members with the specified role(s)",
                type: ApplicationCommandOptionType.Subcommand,
                options: [{
                    name: "required_role",
                    description: "The role that all members must have",
                    type: ApplicationCommandOptionType.Role
                }]
            }]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case RoleSubcommand.Members:
                const requiredRole = interaction.options.getRole("required_role");
                return Role._members(requiredRole?.id);

            default:
                return "Unknown subcommand";
        }
    }

    private static _members(requiredRoleId?: Snowflake): InteractionReplyData {
        const selectMenu = new RoleSelectMenuBuilder()
            .setCustomId(`role-members${requiredRoleId ? `-${requiredRoleId}` : ""}`)
            .setPlaceholder("Select role(s)")
            .setMinValues(1)
            .setMaxValues(3);

        const actionRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .setComponents(selectMenu);

        if (requiredRoleId) {
            return {
                content: `The members must have the role ${roleMention(requiredRoleId)} as well as at least one of the selected role(s).`,
                components: [actionRow],
                ephemeral: false
            }
        } else {
            return {
                content: "The members must have at least one of the selected roles.",
                components: [actionRow],
                ephemeral: false
            }
        }
    }
}

enum RoleSubcommand {
    Members = "members"
}