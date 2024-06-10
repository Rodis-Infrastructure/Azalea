import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    codeBlock,
    EmbedBuilder,
    PermissionFlagsBits
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { DEFAULT_EMBED_COLOR } from "@utils/constants";

import Command from "@managers/commands/Command";

export default class ListPermissions extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "list-permissions",
            description: "List the bot's permission in a channel",
            options: [
                {
                    name: "channel",
                    description: "The channel to list the permissions for",
                    type: ApplicationCommandOptionType.Channel
                },
                {
                    name: "permission",
                    description: "The permission to check",
                    type: ApplicationCommandOptionType.String,
                    choices: Object.keys(PermissionFlagsBits).map(permission => ({
                        name: permission,
                        value: permission
                    }))
                }
            ]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): InteractionReplyData {
        const channel = interaction.options.getChannel("channel") ?? interaction.channel;
        const permission = interaction.options.getString("permission") as keyof typeof PermissionFlagsBits | null;
        const clientMember = interaction.guild.members.me;

        if (!channel) {
            return "Failed to find the channel.";
        }

        if (!clientMember) {
            return "Failed to find the client as a member.";
        }

        let permissions: Record<string, boolean>;

        if (permission) {
            const hasPermission = channel.permissionsFor(clientMember).has(permission);
            permissions = { [permission]: hasPermission };
        } else {
            permissions = channel.permissionsFor(clientMember).serialize();
        }

        const permissionList = Object.entries(permissions).map(([permission, value]) => {
            permission = permission.replace(/(?<=[a-z]|[A-Z]{4})([A-Z])/g, " $1");
            return `${value ? "+" : "-"} ${permission}`;
        }).join("\n");

        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setTitle(`Permissions in ${channel}`)
            .setDescription(codeBlock("diff", permissionList));

        return {
            embeds: [embed],
            ephemeral: true
        };
    }
}