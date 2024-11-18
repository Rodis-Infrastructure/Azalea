import { Events, StageInstance } from "discord.js";
import { handleStageInstance } from "./StageInstanceCreate";

import EventListener from "@managers/events/EventListener";

export default class StageInstanceDelete extends EventListener {
	constructor() {
		super(Events.StageInstanceDelete);
	}

	async execute(stageInstance: StageInstance): Promise<void> {
		await handleStageInstance(stageInstance, false);
	}
}