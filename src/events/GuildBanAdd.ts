import { Events, GuildBan } from "discord.js";
import { handleInfractionExpirationChange } from "@utils/infractions";
import { client } from "./..";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class GuildBanAdd extends EventListener {
    constructor() {
        super(Events.GuildBanAdd);
    }

    async execute(ban: GuildBan): Promise<void> {
        const config = ConfigManager.getGuildConfig(ban.guild.id);
        if (!config) return;

        await handleInfractionExpirationChange({
            updated_by: client.user.id,
            target_id: ban.user.id
        }, config, false);
    }
}