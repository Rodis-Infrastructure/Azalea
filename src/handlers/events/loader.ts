import { AbstractInstanceType } from "../../utils/types.ts";
import { pluralize } from "../../utils";
import { client } from "../../index.ts";

import EventListener from "./EventListener.ts";
import Logger from "../../utils/logger.ts";
import path from "path";
import fs from "fs";

export async function loadListeners(): Promise<void> {
    const dirpath = path.resolve(import.meta.dir, "../../events");
    const filenames = fs.readdirSync(dirpath).filter(file => file !== "Ready.ts");

    for (const filename of filenames) {
        const filepath = path.resolve(dirpath, filename);

        const listenerModule = await import(filepath);
        const listenerClass = listenerModule.default;
        const listener: AbstractInstanceType<typeof EventListener> = new listenerClass();

        // Handle the event once per session
        if (listener.options?.once) {
            client.once(listener.event, (...args) => listener.execute(...args));
            continue;
        }

        // Handle the event every time it is emitted
        client.on(listener.event, (...args) => listener.execute(...args));
    }

    Logger.info(`Loaded ${filenames.length} ${pluralize(filenames.length, "event listener")}`);
}

export async function loadReadyListener(): Promise<void> {
    const dirpath = path.resolve(import.meta.dir, "../../events");
    const readyListenerModule = await import(path.resolve(dirpath, "Ready.ts")).catch(() => null);

    if (!readyListenerModule) return;

    const readyListenerClass = readyListenerModule.default;
    const readyListener: AbstractInstanceType<typeof EventListener> = new readyListenerClass();

    client.once(readyListener.event, (...args) => readyListener.execute(...args));
}