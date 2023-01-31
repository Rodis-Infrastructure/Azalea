import ClientManager from "../../../Client";
import Modal from "./Modal";

import { Collection, ModalSubmitInteraction, TextChannel } from "discord.js";
import { hasInteractionPermission } from "../../../utils/PermissionUtils";
import { sendLog } from "../../../utils/LoggingUtils";
import { Icon, LogType } from "../../../utils/Types";
import { readdir } from "node:fs/promises";
import { join } from "node:path";


export default class ModalHandler {
    list: Collection<string | { startsWith: string } | { endsWith: string } | { includes: string }, Modal>;

    constructor() {
        this.list = new Collection();
    }

    public async load() {
        const files = await readdir(join(__dirname, "../../../interactions/modals"));

        for (const file of files) {
            const modal = (await import(join(__dirname, "../../../interactions/modals", file))).default;
            this.register(new modal());
        }
    }

    public register(modal: Modal) {
        this.list.set(modal.name, modal);
    }

    public async handle(interaction: ModalSubmitInteraction) {
        const config = ClientManager.guildConfigs.get(interaction.guildId as string);

        if (!config) {
            await interaction.reply({
                content: "Guild not configured.",
                ephemeral: true
            });
            return;
        }

        const modal = this.list.find(m => {
            if (typeof m.name === "string") return m.name === interaction.customId;

            if ((m.name as { startsWith: string }).startsWith) return interaction.customId.startsWith((m.name as { startsWith: string }).startsWith);
            if ((m.name as { endsWith: string }).endsWith) return interaction.customId.endsWith((m.name as { endsWith: string }).endsWith);
            if ((m.name as { includes: string }).includes) return interaction.customId.includes((m.name as { includes: string }).includes);

            return false;
        });

        if (!modal) return;

        const modalName = typeof modal.name === "string" ?
            modal.name :
            Object.values(modal.name)[0];

        let memberRoles = interaction.member?.roles;
        if (memberRoles && !Array.isArray(memberRoles)) memberRoles = memberRoles?.cache.map(role => role.id);

        const hasPermission = hasInteractionPermission({
            memberRoles: memberRoles as string[],
            interactionCustomId: modalName,
            interactionType: "modals",
            config
        });

        if (!hasPermission) {
            const requiredRoles = Object.keys(config.rolePermissions || {})
                .filter(role => config.rolePermissions?.[role].modals?.includes(modalName));

            await interaction.reply({
                content: `You do not have permission to use this modal, you must have one of the following roles: \`${requiredRoles.join("` `") || "N/A"}\``,
                ephemeral: true
            });
            return;
        }

        let { ephemeral } = modal;

        if (
            config.forceEphemeralResponse &&
            !modal.skipInternalUsageCheck &&
            !config.forceEphemeralResponse.excludedChannels?.includes(interaction.channelId as string) &&
            !config.forceEphemeralResponse.excludedCategories?.includes((interaction.channel as TextChannel).parentId as string)
        ) ephemeral = true;

        await interaction.deferReply({ ephemeral });

        try {
            await modal.execute(interaction);
        } catch (err) {
            console.log(`Failed to execute modal: ${modal.name}`);
            console.error(err);
            return;
        }

        await sendLog({
            config,
            interaction,
            type: LogType.interactionUsage,
            icon: Icon.Interaction,
            content: `Modal \`${modalName}\` used by ${interaction.user} (\`${interaction.user.id}\`)`,
            fields: [{
                name: "Channel",
                value: `${interaction.channel} (\`#${(interaction.channel as TextChannel).name}\`)`
            }]
        });
    }
}
