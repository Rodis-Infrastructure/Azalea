import { Events } from "discord.js";
import EventListener from "@managers/events/EventListener";

export default class Debug extends EventListener {
    constructor() {
        super(Events.Warn);
    }

    execute(warn: string): void {
        console.log("WARN", warn);
    }
}