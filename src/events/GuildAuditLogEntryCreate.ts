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

import { Action, Flag, handleInfractionCreate } from "@utils/infractions";
import { DEFAULT_INFRACTION_REASON } from "@utils/constants";
import { client } from "./..";

import EventListener from "@managers/events/EventListener";
import ConfigManager from "@managers/config/ConfigManager";
import Sentry from "@sentry/node";

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

        let notification = `${target} has been $ACTION by ${executor} (\`${parsedReason}\`)`;
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
                action = Action.Ban;
                setAction(Action.Ban, "banned");
                break;

            case AuditLogEvent.MemberBanRemove:
                setAction(Action.Unban, "unbanned");
                break;

            case AuditLogEvent.MemberUpdate: {
                const muteDurationDiff = changes.find(change => change.key === "communication_disabled_until");

                if (muteDurationDiff) {
                    // User has been muted
                    if (!muteDurationDiff.old && muteDurationDiff.new) {
                        const msDuration = Date.parse(muteDurationDiff.new as string);
                        const expiresAt = Math.floor(msDuration / 1000);

                        setAction(Action.Mute, `muted until ${time(expiresAt, TimestampStyles.LongDateTime)}`);

                        try {
                            await handleInfractionCreate({
                                guild_id: guild.id,
                                action: Action.Mute,
                                executor_id: executor.id,
                                target_id: target.id,
                                reason: parsedReason,
                                flag: flag,
                                expires_at: new Date(msDuration)
                            }, config);

                            config.sendNotification(notification, false);
                            return;
                        } catch (error) {
                            Sentry.captureException(error);
                        }
                    }

                    // User has been unmuted
                    if (muteDurationDiff.old && !muteDurationDiff.new) {
                        setAction(Action.Unmute, "unmuted");
                    }
                }

                break;
            }
        }

        if (!action) return;

        await handleInfractionCreate({
            guild_id: guild.id,
            action,
            executor_id: executor.id,
            target_id: target.id,
            reason: parsedReason,
            flag
        }, config);

        config.sendNotification(notification, false);
    }
}