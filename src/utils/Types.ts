enum InteractionResponseType {
    Default = 0,
    Defer = 1,
    EphemeralDefer = 2,
}

enum LoggingEvent {
    InteractionUsage = "interactionUsage"
}

type StringInteractionType = "buttons" | "modals" | "selectMenus";

type PermissionData = Record<StringInteractionType, string[] | undefined> & Record<"guildStaff", boolean | undefined>;
type LoggingEventData = ToggleableProperty & Record<LoggingEvent, ToggleableProperty & Record<"channelId", string> | undefined>

interface ToggleableProperty {
    enabled: boolean
    excludedChannels?: string[]
    excludedCategories?: string[]
}

interface ConfigData {
    ephemeralResponses?: ToggleableProperty
    roles?: Array<PermissionData & Record<"id", string>>,
    groups?: Array<PermissionData & Record<"roles", string[]>>,
    logging?: LoggingEventData
}

// Enums
export { LoggingEvent, InteractionResponseType };

// Type Declarations
export { StringInteractionType, ConfigData };
