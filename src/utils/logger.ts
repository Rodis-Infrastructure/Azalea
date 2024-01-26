interface ColorOptions {
    // ANSI color code
    color?: AnsiColor;
    // Whether to color the full log or just the level
    full?: boolean;
}

export enum AnsiColor {
    Reset = "\x1b[0m",
    Green = "\x1b[32m",
    Cyan = "\x1b[36m",
    Grey = "\x1b[90m",
    Red = "\x1b[31m"
}

export default class Logger {
    static log(level: string, message: string, options?: ColorOptions): void {
        const timestamp = new Date().toISOString();
        const timestampString = `${AnsiColor.Grey}[${timestamp}]${AnsiColor.Reset}`;

        if (options?.color && !options.full) {
            console.log(`${timestampString} ${options.color}[${level}]${AnsiColor.Reset} ${message}`);
        } else if (options?.color && options.full) {
            console.log(`${timestampString} ${options.color}[${level}] ${message}${AnsiColor.Reset}`);
        } else {
            console.log(`\x1b[32m${timestampString}${AnsiColor.Reset} [${level}] ${message}`);
        }
    }

    static info(message: string): void {
        Logger.log("INFO", message, {
            color: AnsiColor.Cyan
        });
    }
}