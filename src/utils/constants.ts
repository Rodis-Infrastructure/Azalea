export const LOG_ENTRY_DATE_FORMAT: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
};

export const EMPTY_MESSAGE_CONTENT = "No message content";
export const EMPTY_INFRACTION_REASON = "No infraction reason";
export const EMBED_FIELD_CHAR_LIMIT = 1000;
export const EXIT_EVENTS = ["SIGHUP", "SIGINT", "SIGQUIT", "SIGILL", "SIGTRAP", "SIGABRT", "SIGBUS", "SIGFPE", "SIGUSR1", "SIGSEGV", "SIGUSR2", "SIGTERM", "uncaughtException", "unhandledRejection"];