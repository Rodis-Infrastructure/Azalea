import { InteractionResponseType } from "@bot/types/interactions";
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, Snowflake } from "discord.js";
import { Component } from "@bot/handlers/interactions/interaction";
import { RegexPatterns } from "@bot/utils";
import { db } from "@database/utils.ts";

import Config from "@bot/utils/config";

export default class RemoveRolesButton extends Component<ButtonInteraction<"cached">> {
    constructor() {
        super({
            name: "role-request-role-remove",
            defer: InteractionResponseType.Default,
            skipEphemeralCheck: false
        });
    }

    async execute(interaction: ButtonInteraction<"cached">, _ephemeral: never, config: Config): Promise<void> {
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const [overviewField, userListField] = embed.data.fields!;

        const userIds: Snowflake[] = userListField.value.match(RegexPatterns.Snowflake.pattern) || [];
        const roleId: Snowflake | undefined = overviewField.value.match(RegexPatterns.Snowflake.pattern)?.[1];

        if (!roleId) {
            await interaction.reply({
                content: `${config.emojis.error} Failed to extract the role ID from the request.`,
                ephemeral: true
            });
            return;
        }

        const members = await interaction.guild.members.fetch({ user: userIds });
        await Promise.all(members.map(member => member.roles.remove(roleId)));

        // The role is not permanent
        if (!embed.data.title?.includes("Permanent")) {
            await db.run(`
                DELETE
                FROM temporary_roles
                WHERE request_id = $requestId
            `, [{
                $requestId: interaction.message.id
            }]);
        }

        const deleteBtn = new ButtonBuilder()
            .setCustomId("delete")
            .setLabel("Delete")
            .setStyle(ButtonStyle.Danger);

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
            .setComponents(deleteBtn);

        await interaction.update({ components: [actionRow] });
    }
}