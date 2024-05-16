import { Events, GuildMember } from "discord.js";
import { prisma } from "./..";

import EventListener from "@managers/events/EventListener";

export default class GuildMemberAdd extends EventListener {
    constructor() {
        super(Events.GuildMemberAdd);
    }

    async execute(member: GuildMember): Promise<void> {
        await GuildMemberAdd._removeExpiredRoles(member);
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
}