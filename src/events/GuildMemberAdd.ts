import { Colors, EmbedBuilder, Events, GuildMember, time, TimestampStyles } from "discord.js";
import { InfractionManager } from "@utils/infractions";
import { prisma } from "./..";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";
import { stringifyPositionalNum, userMentionWithId } from "@/utils";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class GuildMemberAdd extends EventListener {
	constructor() {
		super(Events.GuildMemberAdd);
	}

	async execute(member: GuildMember): Promise<void> {
		GuildMemberAdd._logMemberJoin(member);

		await Promise.allSettled([
			GuildMemberAdd._removeExpiredRoles(member),
			GuildMemberAdd._reapplyMute(member)
		]);
	}

	private static async _removeExpiredRoles(member: GuildMember): Promise<void> {
		const now = new Date();
		const [expiredRoles] = await prisma.$transaction([
			prisma.temporaryRole.findMany({
				select: { role_id: true },
				where: {
					member_id: member.id,
					guild_id: member.guild.id,
					expires_at: { lte: now }
				}
			}),
			prisma.temporaryRole.deleteMany({
				where: {
					member_id: member.id,
					guild_id: member.guild.id,
					expires_at: { lte: now }
				}
			})
		]);

		for (const data of expiredRoles) {
			member.roles.remove(data.role_id).catch(() => null);
		}
	}

	private static async _reapplyMute(member: GuildMember): Promise<void> {
		const activeMute = await InfractionManager.getActiveMute(member.id, member.guild.id);

		// If the member has a recent mute, we'll reapply it
		if (activeMute) {
			const now = new Date();
			// The mute hasn't expired and the member isn't muted
			const msDuration = activeMute.expires_at!.getTime() - now.getTime();
			member.timeout(msDuration, `Re-applied mute #${activeMute.id}`);
		} else if (member.isCommunicationDisabled()) {
			// The mute has expired but the member is still muted
			member.timeout(null, "Ended expired mute");
		}
	}

	private static _logMemberJoin(member: GuildMember): void {
		const config = ConfigManager.getGuildConfig(member.guild.id);
		if (!config) return;

		const memberCount = config.guild.memberCount;
		const joinNumber = stringifyPositionalNum(memberCount);

		const logEmbed = new EmbedBuilder()
			.setColor(Colors.Green)
			.setAuthor({ name: "Member Joined" })
			.setThumbnail(member.user.displayAvatarURL())
			.setDescription(`${joinNumber} member to join`)
			.setFields([
				{
					name: "User",
					value: userMentionWithId(member.id)
				},
				{
					name: "Created",
					value: time(member.user.createdAt, TimestampStyles.RelativeTime)
				}
			])
			.setFooter({ text: `ID: ${member.id}` })
			.setTimestamp();

		log({
			event: LoggingEvent.MemberJoin,
			message: { embeds: [logEmbed] },
			member: null,
			channel: null,
			config
		});
	}
}