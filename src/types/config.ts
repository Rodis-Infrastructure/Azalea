export enum RolePermission {
    Button = "buttons",
    Modal = "modals",
    SelectMenu = "selections",
    Reaction = "reactions",
}

interface UserFlag {
    name: string;
    roleIds: string[];
}

export enum LoggingEvent {
    Interaction = "interactions",
    Infraction = "infractions",
    Message = "messages",
    Media = "media",
    Voice = "voice",
    Thread = "threads",
}

export interface PermissionData extends Partial<Record<RolePermission, string[]>> {
    guildStaff?: boolean
    manageInfractions?: boolean
    viewModerationActivity?: boolean
    manageBanRequests?: boolean
    manageMuteRequests?: boolean
    autoMuteBanRequests?: boolean
}

interface ToggleableProperty {
    enabled: boolean
    excludedChannels?: string[]
    excludedCategories?: string[]
}

interface EmojiData {
    success: string
    error: string
    quickMute30?: string
    quickMute60?: string
    purgeMessages?: string
    approveRequest?: string
    denyRequest?: string
}

interface RequestNoticeData {
    enabled: boolean
    channelId: string
    threshold: number
    interval: number
    mentionedRoles?: string[]
}

interface ChannelData {
    banRequestQueue?: string
    muteRequestQueue?: string
    mediaConversion?: string
    confirmations?: string
}

type LoggingData =
    ToggleableProperty
    & Record<LoggingEvent, ToggleableProperty & Record<"channelId", string> | undefined>

export interface AutoReactionData {
    channelId: string
    reactions: string[]
}

export interface ConfigData {
    autoReactions?: AutoReactionData[]
    deleteMessageSecondsOnBan?: number
    allowedProofChannelIds?: string[]
    banRequestNotices?: RequestNoticeData
    muteRequestNotices?: RequestNoticeData
    ephemeralResponses?: ToggleableProperty
    roles?: Array<PermissionData & Record<"id", string>>
    groups?: Array<PermissionData & Record<"roleIds", string[]>>
    logging?: LoggingData
    emojis?: EmojiData
    userFlags?: UserFlag[]
    channels?: ChannelData
}