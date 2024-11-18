import { Events, GuildChannel, OverwriteResolvable, PermissionOverwrites, StageInstance } from "discord.js";

import { captureException } from "@sentry/node";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
import Logger from "@utils/logger";

export default class StageInstanceCreate extends EventListener {
	constructor() {
		super(Events.StageInstanceCreate);
	}

	async execute(stageInstance: StageInstance): Promise<void> {
		await handleStageInstance(stageInstance, true);
	}
}

export async function handleStageInstance(stageInstance: StageInstance, active: boolean): Promise<void> {
	const config = ConfigManager.getGuildConfig(stageInstance.guildId);
	if (!config) return;

	const stageConfig = config.data.stage_event_overrides.find(cfg => {
		return cfg.stage_id === stageInstance.channelId;
	});

	if (!stageConfig) return;
	const action = active ? "created" : "deleted";

	Logger.info(`Monitored stage instance ${action} in ${stageInstance.channelId}`);
	if (active) Logger.info(`Topic: ${stageInstance.topic}`);

	let channels: GuildChannel[] = [];

	try {
		const fetchedChannels = await Promise.all(
			stageConfig.channels.map(channelId => {
				return config.guild.channels.fetch(channelId);
			})
		);

		channels = fetchedChannels.filter(channel => channel !== null) as GuildChannel[];
	} catch (err: unknown) {
		const sentryId = captureException(err);
		Logger.error(`Failed to fetch channels: ${sentryId}`);
		return;
	}

	Logger.info("Applying permission overwrites to channels");

	for (const channel of channels) {
		const permissionOverwrites: OverwriteResolvable[] = [];

		for (const permissionOverwrite of channel.permissionOverwrites.cache.values()) {
			// Skip if the permission overwrite for the role is not in the config
			if (!stageConfig.roles.includes(permissionOverwrite.id)) {
				permissionOverwrites.push(permissionOverwrite);
				continue;
			}

			// eslint-disable-next-line @typescript-eslint/naming-convention
			const updatedPermissionOverwrites = PermissionOverwrites.resolveOverwriteOptions({ SendMessages: active }, {
				allow: permissionOverwrite.allow,
				deny: permissionOverwrite.deny
			});

			permissionOverwrites.push({
				id: permissionOverwrite.id,
				allow: updatedPermissionOverwrites.allow,
				deny: updatedPermissionOverwrites.deny
			});
		}

		try {
			await channel.edit({
				permissionOverwrites,
				reason: `Monitored stage instance ${action}`
			});
		} catch (err: unknown) {
			const sentryId = captureException(err);
			Logger.error(`Failed to apply overrides to channel ${channel.id}: ${sentryId}`);
			return;
		}
	}

	Logger.info("Successfully applied permission overwrites to all channels");
}