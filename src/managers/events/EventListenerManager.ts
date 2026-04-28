import { client } from "@/index";
import { pluralize } from "@/utils";
import { captureException } from "@sentry/node";

import Logger, { AnsiColor } from "@utils/logger";
import EventListener from "./EventListener";
import path from "path";
import fs from "fs";

// Utility class for handling event listeners.
export default class EventListenerManager {
	// Mounts all event listeners from the events directory.
	static async mount(): Promise<void> {
		const dirpath = path.resolve("src/events");

		if (!fs.existsSync(dirpath)) {
			Logger.info("Skipping event mounting: events directory not found");
			return;
		}

		Logger.info("Mounting event listeners...");

		const filenames = fs.readdirSync(dirpath).filter(file => file.endsWith(".ts"));
		let eventListenerCount = 0;

		for (const filename of filenames) {
			try {
				const filepath = path.resolve(dirpath, filename);

				// Import and initiate the event listener
				const listenerModule = await import(filepath);
				const listenerClass = listenerModule.default;
				const listener = new listenerClass();

				// Ensure the listener is an instance of the EventListener class
				if (!(listener instanceof EventListener)) {
					continue;
				}

				const logMessage = `Mounted event listener "${listener.event}"`;

				// Wrap the listener execution in an error boundary to prevent
				// unhandled errors from crashing the bot
				const safeExecute = (...args: unknown[]): void => {
					Promise.resolve(listener.execute(...args)).catch(error => {
						Logger.error(`Error in event listener "${listener.event}": ${error}`);
						captureException(error);
					});
				};

				if (listener.options?.once) {
					client.once(listener.event, safeExecute);

					Logger.log("ONCE", logMessage, {
						color: AnsiColor.Purple
					});
				} else {
					client.on(listener.event, safeExecute);

					Logger.log("ON", logMessage, {
						color: AnsiColor.Purple
					});
				}

				eventListenerCount++;
			} catch (error) {
				Logger.error(`Failed to mount event listener from "${filename}": ${error}`);
				captureException(error);
			}
		}

		Logger.info(`Mounted ${eventListenerCount} ${pluralize(eventListenerCount, "event listener")}`);
	}
}