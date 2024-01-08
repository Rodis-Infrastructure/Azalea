import { CacheType, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";

export type ComponentInteraction<Cached extends CacheType = CacheType> =
    MessageComponentInteraction<Cached> |
    ModalSubmitInteraction<Cached>;

export default abstract class Component {
    protected constructor(public customId: string) {}

    abstract execute(interaction: ComponentInteraction<"cached">): Promise<void> | void;
}