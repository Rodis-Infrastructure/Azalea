import { Events, GuildBan } from "discord.js";
import { endActiveInfractions } from "@utils/infractions";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class GuildBanAdd extends EventListener {
    constructor() {
        super(Events.GuildBanAdd);
    }

    async execute(ban: GuildBan): Promise<void> {
        const config = ConfigManager.getGuildConfig(ban.guild.id);
        if (!config) return;

        await endActiveInfractions(ban.guild.id, ban.user.id);
    }
}