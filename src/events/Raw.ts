/* eslint-disable @typescript-eslint/no-explicit-any */
import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

import { Events, GatewayDispatchEvents } from "discord.js";
import { RawMessageData } from "discord.js/typings/rawDataTypes";
import { Permission } from "@managers/config/schema";
import { client } from "./..";

export default class Raw extends EventListener {
    constructor() {
        // @ts-expect-error - 'Raw' is not part of 'ClientEvents' but is supported
        super(Events.Raw);
    }

    execute(packet: any): void {
        Raw._handleForwardRemoval(packet);
    }

    private static async _handleForwardRemoval(packet: any): Promise<void> {
        const event: GatewayDispatchEvents = packet.t;

        // Only handle message creation events
        // Since forwarded messages cannot be edited into normal messages
        if (event !== GatewayDispatchEvents.MessageCreate) return;

        const data: RawMessageData = packet.d;

        // Only handle forwarded messages
        // The type for forwarded messages is 1
        // @ts-expect-error - 'type' exists in 'message_reference'
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
    }
}