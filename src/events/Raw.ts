/* eslint-disable @typescript-eslint/no-explicit-any */
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

import { Colors, EmbedBuilder, Events, GatewayDispatchEvents } from "discord.js";
import { LoggingEvent, Permission } from "@managers/config/schema";
import { client } from "@";
import { channelMentionWithName, userMentionWithId } from "@/utils";
import { formatMessageContentForShortLog } from "@utils/messages";
import { log } from "@utils/eventLogging";

export default class Raw extends EventListener {
	constructor() {
		// @ts-expect-error - 'Raw' is not part of 'ClientEvents' but is supported
		super(Events.Raw);
	}

	async execute(packet: any): Promise<void> {
		await Raw._handleForwardRemoval(packet);
	}

	private static async _handleForwardRemoval(packet: any): Promise<void> {
		const event: GatewayDispatchEvents = packet.t;

		// Only handle message creation events
		// Since forwarded messages cannot be edited into normal messages
		if (event !== GatewayDispatchEvents.MessageCreate) return;

		const data = packet.d as {
			id: string;
			channel_id: string;
			author: { id: string };
			message_reference?: { type?: number };
			message_snapshots?: Array<{ message: { content: string } }>;
		};

		// Only handle forwarded messages (type 1 = forwarded)
		if (data.message_reference?.type !== 1) return;

		const channel = await client.channels.fetch(data.channel_id)
			.catch(() => null);

		// Ensure the message is in a text-based guild channel
		if (!channel?.isTextBased() || channel.isDMBased()) return;

		const config = ConfigManager.getGuildConfig(channel.guild.id);

		// Cannot perform permission checks without the config
		if (!config) return;

		const member = await channel.guild.members.fetch(data.author.id);

		// Don't remove forwarded messages if the user has the permission to forward messages
		if (config.hasPermission(member, Permission.ForwardMessages)) return;

		// Delete the forwarded message
		channel.messages.delete(data.id)
			.catch(() => null);

		// Log the deletion of the forwarded message
		const content = data.message_snapshots?.[0]?.message.content ?? null;
		const embed = new EmbedBuilder()
			.setColor(Colors.Red)
			.setAuthor({ name: "Forwarded Message Deleted" })
			.setFields([
				{
					name: "Author",
					value: userMentionWithId(data.author.id)
				},
				{
					name: "Channel",
					value: channelMentionWithName(channel)
				},
				{
					name: "Forwarded Message Content",
					value: await formatMessageContentForShortLog(content, null, null)
				}
			])
			.setTimestamp();

		log({
			event: LoggingEvent.MessageDelete,
			message: { embeds: [embed] },
			config,
			member,
			channel
		});
	}
}