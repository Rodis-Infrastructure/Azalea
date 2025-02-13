import { Colors, EmbedBuilder, Events, GuildMember, time, TimestampStyles } from "discord.js";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";
import { userMentionWithId } from "@/utils";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class GuildMemberRemove extends EventListener {
	constructor() {
		super(Events.GuildMemberRemove);
	}

	execute(member: GuildMember): void {
		GuildMemberRemove._logMemberLeave(member);
	}

	private static _logMemberLeave(member: GuildMember): void {
		const config = ConfigManager.getGuildConfig(member.guild.id);
		if (!config) return;

		const logEmbed = new EmbedBuilder()
			.setColor(Colors.Red)
			.setAuthor({ name: "Member Left" })
			.setThumbnail(member.user.displayAvatarURL())
			.setFields([
				{
					name: "User",
					value: userMentionWithId(member.id)
				},
				{
					name: "Created",
					value: time(member.user.createdAt, TimestampStyles.RelativeTime),
					inline: true
				}
			])
			.setFooter({ text: `ID: ${member.id}` })
			.setTimestamp();

		if (member.joinedAt) {
			logEmbed.addFields({
				name: "Joined",
				value: time(member.joinedAt, TimestampStyles.RelativeTime),
				inline: true
			});
		}

		log({
			event: LoggingEvent.MemberLeave,
			message: { embeds: [logEmbed] },
			member: null,
			channel: null,
			config
		});
	}
}