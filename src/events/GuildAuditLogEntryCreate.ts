import {
    AuditLogEvent,
    Events,
    Guild,
    GuildAuditLogsEntry,
    GuildMember,
    time,
    TimestampStyles,
    User
} from "discord.js";

import { InfractionAction, InfractionFlag, InfractionManager, InfractionUtil } from "@utils/infractions";
import { DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { client } from "./..";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";

export default class GuildAuditLogEntryCreate extends EventListener {
    constructor() {
        super(Events.GuildAuditLogEntryCreate);
    }

    async execute(auditLog: GuildAuditLogsEntry, guild: Guild): Promise<void> {
        const { target, reason, changes, executorId } = auditLog;
        const config = ConfigManager.getGuildConfig(guild.id);

        if (!config || !executorId || executorId === client.user.id) return;
        if (!(target instanceof User) && !(target instanceof GuildMember)) return;

        const executor = await client.users.fetch(executorId).catch(() => null);
        if (!executor) return;

        const parsedReason = reason ?? DEFAULT_INFRACTION_REASON;
        const formattedReason = InfractionUtil.formatReason(parsedReason);

        let notification = `${target} has been $ACTION by ${executor} - \`#$INFRACTION_ID\` ${formattedReason}`;
        let action: InfractionAction | undefined;

        const setAction = (actionType: InfractionAction, str: string): void => {
            notification = notification.replace("$ACTION", str);
            action = actionType;
        };

        const flag = executor.bot
            ? InfractionFlag.Automatic
            : InfractionFlag.Native;

        switch (auditLog.action) {
            case AuditLogEvent.MemberKick:
                setAction(InfractionAction.Kick, "kicked");
                break;

            case AuditLogEvent.MemberBanAdd:
                setAction(InfractionAction.Ban, "banned");
                break;

            case AuditLogEvent.MemberBanRemove:
                setAction(InfractionAction.Unban, "unbanned");
                break;

            case AuditLogEvent.MemberUpdate: {
                const muteDurationDiff = changes.find(change => change.key === "communication_disabled_until");

                if (muteDurationDiff) {
                    // User has been muted
                    if (muteDurationDiff.new) {
                        const msDuration = Date.parse(muteDurationDiff.new as string);
                        const expiresAt = Math.floor(msDuration / 1000);

                        setAction(InfractionAction.Mute, `set on a timeout that will end ${time(expiresAt, TimestampStyles.RelativeTime)}`);

                        const infraction = await InfractionManager.storeInfraction({
                            guild_id: guild.id,
                            action: InfractionAction.Mute,
                            executor_id: executor.id,
                            target_id: target.id,
                            reason: parsedReason,
                            flag: flag,
                            expires_at: new Date(msDuration)
                        });

                        if (infraction) {
                            notification = notification.replace("$INFRACTION_ID", infraction.id.toString());
                            InfractionManager.logInfraction(infraction, config);
                        } else {
                            notification = notification.replace("$INFRACTION_ID", "unknown");
                        }

                        config.sendNotification(notification, false);
                        return;
                    }

                    // User has been unmuted
                    if (!muteDurationDiff.new) {
                        setAction(InfractionAction.Unmute, "unmuted");
                        await InfractionManager.endActiveMutes(guild.id, target.id);
                    }
                }

                break;
            }
        }

        if (!action) return;

        const infraction = await InfractionManager.storeInfraction({
            guild_id: guild.id,
            action,
            executor_id: executor.id,
            target_id: target.id,
            reason: parsedReason,
            flag
        });

        if (infraction) {
            notification = notification.replace("$INFRACTION_ID", infraction.id.toString());
            InfractionManager.logInfraction(infraction, config);
        } else {
            notification = notification.replace("$INFRACTION_ID", "unknown");
        }

        config.sendNotification(notification, false);
    }
}