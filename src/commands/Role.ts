import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    RoleSelectMenuBuilder,
    EmbedBuilder,
    Role as DiscordRole
} from "discord.js";

import { InteractionReplyData } from "@utils/types";

import Command from "@managers/commands/Command";
import { DEFAULT_EMBED_COLOR } from "@utils/constants";

export default class Role extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "role",
            description: "Manage roles",
            options: [{
                name: RoleSubcommand.Members,
                description: "List all members with the specified role(s)",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    {
                        name: "required_role",
                        description: "The role that all members must have",
                        type: ApplicationCommandOptionType.Role
                    },
                    {
                        name: "embed_title",
                        description: "The title of the embed",
                        type: ApplicationCommandOptionType.String,
                        max_length: 256,
                        min_length: 1
                    }
                ]
            }]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case RoleSubcommand.Members: {
                const requiredRole = interaction.options.getRole("required_role");
                const embedTitle = interaction.options.getString("embed_title");
                return Role._members(requiredRole, embedTitle);
            }

            default:
                return "Unknown subcommand";
        }
    }

    private static _members(requiredRole: DiscordRole | null, embedTitle: string | null): InteractionReplyData {
        const selectMenu = new RoleSelectMenuBuilder()
            .setCustomId(`role-members${requiredRole ? `-${requiredRole.id}` : ""}`)
            .setPlaceholder("Select role(s)")
            .setMinValues(1)
            .setMaxValues(3);

        const actionRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .setComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setDescription(`No members to display, select role(s) to list the members. The members must have at least one of the selected role(s).`)
            .setColor(DEFAULT_EMBED_COLOR);

        if (embedTitle) {
            embed.setTitle(embedTitle);
        }

        if (requiredRole) {
            embed.setColor(requiredRole.color);
            embed.setFooter({ text: `Required Role ID: ${requiredRole.id}` });

            embed.data.title ??= `Members with the role @${requiredRole.name}`;
        }

        return {
            embeds: [embed],
            components: [actionRow],
            ephemeral: false
        };
    }
}

enum RoleSubcommand {
    Members = "members"
}