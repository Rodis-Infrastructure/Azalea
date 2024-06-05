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

import {
    Action,
    endActiveInfractions,
    Flag,
    handleInfractionCreate
} from "@utils/infractions";

import { DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { client } from "./..";
import { formatInfractionReason } from "@/utils";

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
        const formattedReason = formatInfractionReason(parsedReason);

        let notification = `${target} has been $ACTION by ${executor} - \`#$INFRACTION_ID\` ${formattedReason}`;
        let action: Action | undefined;

        const setAction = (actionType: Action, str: string): void => {
            notification = notification.replace("$ACTION", str);
            action = actionType;
        };

        const flag = executor.bot
            ? Flag.Automatic
            : Flag.Native;

        switch (auditLog.action) {
            case AuditLogEvent.MemberKick:
                setAction(Action.Kick, "kicked");
                break;

            case AuditLogEvent.MemberBanAdd:
                setAction(Action.Ban, "banned");
                break;

            case AuditLogEvent.MemberBanRemove:
                setAction(Action.Unban, "unbanned");
                break;

            case AuditLogEvent.MemberUpdate: {
                const muteDurationDiff = changes.find(change => change.key === "communication_disabled_until");

                if (muteDurationDiff) {
                    // User has been muted
                    if (muteDurationDiff.new) {
                        const msDuration = Date.parse(muteDurationDiff.new as string);
                        const expiresAt = Math.floor(msDuration / 1000);

                        setAction(Action.Mute, `set on a timeout that will end ${time(expiresAt, TimestampStyles.RelativeTime)}`);

                        const infraction = await handleInfractionCreate({
                            guild_id: guild.id,
                            action: Action.Mute,
                            executor_id: executor.id,
                            target_id: target.id,
                            reason: parsedReason,
                            flag: flag,
                            expires_at: new Date(msDuration)
                        }, config);

                        if (infraction) {
                            notification = notification.replace("$INFRACTION_ID", infraction.id.toString());
                        } else {
                            notification = notification.replace("$INFRACTION_ID", "unknown");
                        }

                        config.sendNotification(notification, false);
                        return;
                    }

                    // User has been unmuted
                    if (!muteDurationDiff.new) {
                        setAction(Action.Unmute, "unmuted");
                        await endActiveInfractions(guild.id, target.id);
                    }
                }

                break;
            }
        }

        if (!action) return;

        const infraction = await handleInfractionCreate({
            guild_id: guild.id,
            action,
            executor_id: executor.id,
            target_id: target.id,
            reason: parsedReason,
            flag
        }, config);

        if (infraction) {
            notification = notification.replace("$INFRACTION_ID", infraction.id.toString());
        } else {
            notification = notification.replace("$INFRACTION_ID", "unknown");
        }

        config.sendNotification(notification, false);
    }
}