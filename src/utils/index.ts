import Logger, { AnsiColor } from "./logger.ts";
import { MessageCache } from "./messages.ts";
import { prisma } from "../index.ts";

import fs from "fs";
import YAML from "yaml";

export function pluralize(count: number, singular: string, plural?: string): string {
    plural ??= `${singular}s`;
    return count === 1 ? singular : plural;
}

export function readYamlFile<T>(path: string): T {
    const raw = fs.readFileSync(path, "utf-8");
    return YAML.parse(raw);
}

export function elipsify(str: string, length: number): string {
    const maxLength = length - 25;
    const newStr = str.slice(0, maxLength);
    return str.length > length
        ? `${newStr}...(${str.length - newStr.length} more characters)`
        : str;
}

// Stores cached messages and terminates the database connection
export async function handleProcessExit(event: string): Promise<void> {
    Logger.log(event, "Starting cleanup operations...", {
        color: AnsiColor.Red,
        fullColor: true
    });

    try {
        await MessageCache.clear();
        await terminateDbConnection();
    } catch (error) {
        Logger.log(event, `Cleanup operations failed: ${error}`, {
            color: AnsiColor.Red,
            fullColor: true
        });
    } finally {
        Logger.log(event, "Successfully completed cleanup operations", {
            color: AnsiColor.Red,
            fullColor: true
        });
    }

    process.exit(0);
}

async function terminateDbConnection(): Promise<void> {
    Logger.info("Terminating database connection...");

    await prisma.$disconnect()
        .then(() => {
            Logger.info("Successfully disconnected from database");
        });
}