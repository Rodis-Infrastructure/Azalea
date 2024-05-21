/**
 * The status of a message report.
 *
 * - `QuickMute30`: The report has been resolved by muting the user for 30 minutes.
 * - `QuickMute60`: The report has been resolved by muting the user for an hour.
 * - `Resolved`: The report has been resolved.
 * - `Unresolved`: The report has not been resolved.
 * - `Expired`: The report has expired.
 */
export enum MessageReportStatus {
    QuickMute30 = "quick_mute_30",
    QuickMute60 = "quick_mute_60",
    Resolved = "resolved",
    Unresolved = "unresolved",
    Expired = "expired"
}

/**
 * The status of a user report.
 *
 * - `Resolved`: The report has been resolved.
 * - `Unresolved`: The report has not been resolved.
 * - `Expired`: The report has expired.
 */
export enum UserReportStatus {
    Resolved = "resolved",
    Unresolved = "unresolved",
    Expired = "expired"
}

export enum MessageReportFlag {
    HasAttachment = 1 << 0,
    /** @deprecated The sticker information is included in the message preview */
    HasSticker = 1 << 1,
    Updated = 1 << 2,
    Deleted = 1 << 3,
    Spam = 1 << 4
}