import { EmbedBuilder, Message } from "discord.js";

export class MessageReportUtil {
    static async updateFlags(report: Message<true>, flags: MessageReportFlag, edit = false): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder(report.embeds[0].toJSON());
        const mappedFlags = MessageReportUtil.formatFlags(flags);
        const flagFieldIdx = embed.data.fields!.findIndex(field => field.name === "Flags");
        const deleteCount = flagFieldIdx !== -1 ? 1 : 0;

        embed.spliceFields(flagFieldIdx, deleteCount, {
            name: "Flags",
            value: mappedFlags
        });

        if (edit) {
            await report.edit({ embeds: [embed] });
        }

        return embed;
    }

    static formatFlags(flags: MessageReportFlag): string {
        const entries = Object.entries(MessageReportFlag)
            .filter((entry): entry is [string, MessageReportFlag] => {
                return typeof entry[1] !== "string" && Boolean(flags & entry[1]);
            });

        return entries.map(entry => `\`${entry[0]}\``).join(", ");
    }
}

/** The status of a message report. */
export enum MessageReportStatus {
    /** The report has been resolved by muting the user for 30 minutes. */
    QuickMute30 = 1,
    /** The report has been resolved by muting the user for an hour. */
    QuickMute60 = 2,
    /** The report has been resolved. */
    Resolved = 3,
    /** The report has not been resolved. */
    Unresolved = 4,
    /** The report has expired. */
    Expired = 5
}

/** The status of a user report. */
export enum UserReportStatus {
    /** The report has been resolved. */
    Resolved = 1,
    /** The report has not been resolved. */
    Unresolved = 2,
    /** The report has expired. */
    Expired = 3
}

/** Flags that provide additional context to a message report. */
export enum MessageReportFlag {
    /** The message has an attachment (e.g. image or video). */
    HasAttachment = 1 << 0,
    /** @deprecated The sticker information is included in the message preview */
    HasSticker = 1 << 1,
    /** The message was modified. */
    Updated = 1 << 2,
    /** The message was deleted. */
    Deleted = 1 << 3,
    /** More than one message with the same content was reported (by the same author). */
    Spam = 1 << 4
}