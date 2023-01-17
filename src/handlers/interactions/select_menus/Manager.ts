import ClientManager from "../../../Client";

import {Collection, StringSelectMenuInteraction, TextChannel} from "discord.js";
import {Icon, InteractionResponseType, LogType} from "../../../utils/Types";
import {hasInteractionPermission} from "../../../utils/PermissionUtils";
import {sendLog} from "../../../utils/LoggingUtils";
import {readdir} from "node:fs/promises";
import {join} from "node:path";

import SelectMenu from "./SelectMenu";

export default class SelectMenuHandler {
    list: Collection<string | { startsWith: string } | { endsWith: string } | { includes: string }, SelectMenu>;

    constructor() {
        this.list = new Collection();
    }

    public async load() {
        const files = await readdir(join(__dirname, "../../../interactions/select_menus"))

        for (const file of files) {
            const selectMenu = (await import(join(__dirname, "../../../interactions/select_menus", file))).default;
            await this.register(new selectMenu());
        }
    }

    public async register(select_menu: SelectMenu) {
        this.list.set(select_menu.name, select_menu);
    }

    public async handle(interaction: StringSelectMenuInteraction) {
        const config = ClientManager.guildConfigs.get(interaction.guildId as string);

        if (!config) {
            await interaction.reply({
                content: "Guild not configured.",
                ephemeral: true
            });
            return;
        }

        const selectMenu = this.list.find(s => {
            if (typeof s.name === "string") return s.name === interaction.customId;

            if ((s.name as { startsWith: string }).startsWith) return interaction.customId.startsWith((s.name as { startsWith: string }).startsWith);
            if ((s.name as { endsWith: string }).endsWith) return interaction.customId.endsWith((s.name as { endsWith: string }).endsWith);
            if ((s.name as { includes: string }).includes) return interaction.customId.includes((s.name as { includes: string }).includes);

            return false;
        });

        if (!selectMenu) return;

        const selectMenuName = typeof selectMenu.name === "string" ?
            selectMenu.name :
            Object.values(selectMenu.name)[0];

        let memberRoles = interaction.member?.roles;
        if (memberRoles && !Array.isArray(memberRoles)) memberRoles = memberRoles?.cache.map(role => role.id);

        const hasPermission = hasInteractionPermission({
            memberRoles: memberRoles as string[],
            interactionCustomId: selectMenuName,
            interactionType: "selectMenus",
            config
        });

        if (!hasPermission) {
            const requiredRoles = Object.keys(config.rolePermissions || {})
                .filter(role => config.rolePermissions?.[role].selectMenus?.includes(selectMenuName));

            await interaction.reply({
                content: `You do not have permission to use this command, you must have one of the following roles: \`${requiredRoles.join("` `") || "N/A"}\``,
                ephemeral: true
            });
            return;
        }


        let ResponseType = selectMenu.defer;
        if (
            config.forceEphemeralResponse &&
            !selectMenu.skipInternalUsageCheck &&
            !config.forceEphemeralResponse.excludedChannels?.includes(interaction.channelId as string) &&
            !config.forceEphemeralResponse.excludedCategories?.includes((interaction.channel as TextChannel).parentId as string)
        ) ResponseType = InteractionResponseType.EphemeralDefer;

        switch (ResponseType) {
            case InteractionResponseType.Defer: {
                await interaction.deferReply();
                break;
            }

            case InteractionResponseType.EphemeralDefer: {
                await interaction.deferReply({ephemeral: true});
            }
        }

        try {
            await selectMenu.execute(interaction);
        } catch (err) {
            console.log(`Failed to execute select menu: ${selectMenuName}`);
            console.error(err);
            return;
        }

        await sendLog({
            config,
            interaction,
            type: LogType.interactionUsage,
            icon: Icon.Interaction,
            content: `Select Menu \`${selectMenuName}\` used by ${interaction.user} (\`${interaction.user.id}\`)`,
            fields: [{
                name: "Channel",
                value: `${interaction.channel} (\`#${(interaction.channel as TextChannel).name}\`)`
            }]
        });
    }
}