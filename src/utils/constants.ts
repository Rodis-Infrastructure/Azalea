import { EmbedField, GatewayIntentBits, Partials, PermissionFlagsBits } from "discord.js";

export const LOG_ENTRY_DATE_FORMAT: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hour12: false
};

export const EMPTY_MESSAGE_CONTENT = "No message content";

export const DEFAULT_INFRACTION_REASON = "No infraction reason";

export const EMBED_FIELD_CHAR_LIMIT = 1000;

// 28 days
export const DEFAULT_MUTE_DURATION = 1000 * 60 * 60 * 24 * 28;

// 28 days
export const MAX_MUTE_DURATION = 1000 * 60 * 60 * 24 * 28;

export const EXIT_EVENTS = ["SIGHUP", "SIGINT", "SIGQUIT", "SIGILL", "SIGTRAP", "SIGABRT", "SIGBUS", "SIGFPE", "SIGUSR1", "SIGSEGV", "SIGUSR2", "SIGTERM", "uncaughtException", "unhandledRejection"];


// The default permissions required to use commands.
export const DEFAULT_COMMAND_PERMISSIONS: readonly bigint[] = [PermissionFlagsBits.ManageGuild];

export const DURATION_FORMAT = /^(\d+ *(days?|h(ou)?rs?|min(utes?)?|[mhd]) *)+$/gmi;

// The default state of whether commands should be allowed in DMs.
export const DEFAULT_DM_PERMISSION: boolean = false;

// The default intents for the Discord client.
export const CLIENT_INTENTS: readonly GatewayIntentBits[] = [
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds
];

// The default partials for the Discord client.
export const CLIENT_PARTIALS: Partials[] = [
    Partials.Reaction,
    Partials.Message
];

// An empty embed field. Typically used for layout purposes.
export const BLANK_EMBED_FIELD: EmbedField = {
    name: "\u200b",
    value: "\u200b",
    inline: true
};