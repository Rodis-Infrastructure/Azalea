import { humanizeTimestamp, userMentionWithId } from "./index";
import { Infraction, Prisma } from "@prisma/client";
import { ColorResolvable, Colors, EmbedBuilder, GuildMember } from "discord.js";
import { Snowflake } from "discord-api-types/v10";
import { client, prisma } from "./..";
import { log } from "./logging";
import { LoggingEvent } from "@managers/config/schema";
import { DEFAULT_INFRACTION_REASON } from "./constants";
import { TypedRegEx } from "typed-regex";
import { Result } from "./types";

import GuildConfig from "@managers/config/GuildConfig";

export class InfractionManager {
    static storeInfraction(data: Prisma.InfractionCreateInput): Promise<Infraction> {
        return prisma.infraction.create({ data });
    }

    static async deleteInfraction(infractionId: number): Promise<void> {
        await prisma.infraction.delete({ where: { id: infractionId } });
    }

    static logInfraction(infraction: Infraction, executor: GuildMember | null, config: GuildConfig): void {
        const embedColor = InfractionUtil.mapActionToEmbedColor(infraction.action);
        const formattedAction = InfractionUtil.formatAction(infraction.action, infraction.flag);

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({ name: `${formattedAction} Executed` })
            .setFields([
                { name: "Executor", value: userMentionWithId(infraction.executor_id) },
                { name: "Offender", value: userMentionWithId(infraction.target_id) },
                { name: "Reason", value: infraction.reason ?? DEFAULT_INFRACTION_REASON }
            ])
            .setFooter({ text: `#${infraction.id}` })
            .setTimestamp();

        if (infraction.expires_at) {
            // Since the infraction is new, we can assume that the expiration date is in the future.
            const msDuration = infraction.expires_at.getTime() - infraction.created_at.getTime();
            const humanizedDuration = humanizeTimestamp(msDuration);

            // Insert the duration field after the target field
            embed.spliceFields(2, 0, {
                name: "Duration",
                value: humanizedDuration
            });
        }

        log({
            event: LoggingEvent.InfractionCreate,
            message: { embeds: [embed] },
            channel: null,
            member: executor,
            config
        });
    }

    static async endActiveMutes(guildId: Snowflake, targetId: Snowflake): Promise<void> {
        const now = new Date();

        await prisma.infraction.updateMany({
            where: {
                expires_at: { gt: now },
                guild_id: guildId,
                target_id: targetId
            },
            data: {
                expires_at: now,
                updated_at: now,
                updated_by: client.user.id
            }
        });
    }

    static getActiveMute(targetId: Snowflake, guildId: Snowflake): Promise<Infraction | null> {
        return prisma.infraction.findFirst({
            where: {
                target_id: targetId,
                guild_id: guildId,
                action: InfractionAction.Mute,
                expires_at: { gt: new Date() }
            }
        });
    }
}

export class InfractionUtil {
    /**
     * Get the embed color for an infraction log based on its action
     *
     * @param action - The action associated with the infraction
     * @returns The hexadecimal embed color
     */
    static mapActionToEmbedColor(action: InfractionAction): ColorResolvable {
        switch (action) {
            case InfractionAction.Ban:
                return Colors.Blue;
            case InfractionAction.Unban:
                return Colors.Green;
            case InfractionAction.Kick:
                return Colors.Red;
            case InfractionAction.Mute:
                return Colors.Orange;
            case InfractionAction.Unmute:
                return Colors.Green;
            case InfractionAction.Warn:
                return Colors.Yellow;
            case InfractionAction.Note:
                return Colors.Purple;
            default:
                return Colors.NotQuiteBlack;
        }
    }

    /**
     * Get a parsed string representing the infraction type
     *
     * @param action - The action associated with the infraction
     * @param flag - The flag associated with the infraction
     * @returns A string combining the string representation of the action and flag
     */
    static formatAction(action: InfractionAction, flag: InfractionFlag): string {
        return [InfractionFlag[flag], InfractionAction[action]]
            .filter(Boolean)
            .join(" ");
    }

    static async validateReason(reason: string, config: GuildConfig): Promise<Result> {
        const { exclude_domains, message_links } = config.data.infraction_reasons;

        const domainRegex = TypedRegEx(`https?://(?<domain>${exclude_domains.domains.join("|")})`, "i");
        const domainMatch = domainRegex.captures(reason);

        if (exclude_domains.domains.length && domainMatch) {
            const parsedFailureMessage = exclude_domains.failure_message
                .replace("$DOMAIN", domainMatch.domain);

            return {
                success: false,
                message: parsedFailureMessage
            };
        }

        const channelIdRegex = TypedRegEx(`channels/${config.guild.id}/(?<channelId>\\d{17,19})`, "g");
        const channelIdMatches = channelIdRegex.captureAll(reason)
            .filter((match): match is { channelId: string } => Boolean(match))
            .map(({ channelId }) => channelId);

        const channels = await Promise.all(
            channelIdMatches.map(channelId => config.guild.channels.fetch(channelId).catch(() => null))
        );

        for (const channel of channels) {
            if (!channel) continue;

            const inScope = config.channelInScope(channel, message_links.scoping);

            if (!inScope) {
                const parsedFailureMessage = message_links.failure_message
                    .replace("$CHANNEL_ID", channel.id)
                    .replace("$CHANNEL_NAME", channel.name);

                return {
                    success: false,
                    message: parsedFailureMessage
                };
            }
        }

        return { success: true };
    }

    /**
     * Formats the infraction reason to appended to a confirmation response
     *
     * - Removes backticks since they cannot be escaped and clash with the applied format
     * - Wraps the reason in inline code and parentheses: (\`{reason}\`)
     *
     * @param reason - The reason to format
     */
    static formatReason(reason: string): `(\`${string}\`)` {
        const cleanReason = reason.replaceAll("`", "");
        return `(\`${cleanReason}\`)`;
    }

    /**
     * Cleans the reason by removing...
     *
     * - Links
     * - Purge logs (format: `(Purge log: ...)`)
     * - Unnecessary whitespace
     *
     * @param reason - The reason to clean
     * @returns The clean reason
     */
    static formatReasonPreview(reason: string): string {
        return reason
            // Remove links
            .replaceAll(/https?:\/\/[^\s\n\r]+/gi, "")
            // Remove purge log
            .replace(/ \(Purge log:.*/gi, "")
            // Remove unnecessary whitespace
            .replaceAll(/\s{2,}/g, " ")
            .trim();
    }
}

export enum InfractionAction {
    Warn = 1,
    Unmute = 2,
    Mute = 3,
    Kick = 4,
    Unban = 5,
    Ban = 6,
    Note = 7,
}

// Quick mute duration in milliseconds
export enum QuickMuteDuration {
    // 30 minutes
    Short = 1_800_000,
    // 1 hour
    Long = 3_600_000,
}

export enum InfractionFlag {
    // Infractions carried out using pre-set actions
    Quick = 1,
    // Infractions carried out by bots
    Automatic = 2,
    // Infractions carried out using discord's native tools
    Native = 3,
}