import { Events } from "discord.js";
import EventListener from "@managers/events/EventListener";

export default class Debug extends EventListener {
    constructor() {
        super(Events.Debug);
    }

    execute(debug: string): void {
        console.log("DEBUG", debug);
    }
}