import { MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { CommandResponse } from "@utils/types";

// The base class for all component interactions.
export default abstract class Component {
	/**
     * @param customId The custom ID of the component.
     * @protected
     */
	protected constructor(public readonly customId: CustomID) {
	}

    /**
     * Handles the component interaction. Mentions are disabled by default.
     * @param interaction The interaction to handle.
     */
    abstract execute(interaction: ComponentInteraction): CommandResponse | Promise<CommandResponse>;
}

export type ComponentInteraction = MessageComponentInteraction | ModalSubmitInteraction;
export type CustomID = string | { startsWith: string } | { endsWith: string } | { includes: string } | {
    matches: RegExp
};