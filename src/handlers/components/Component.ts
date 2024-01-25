import { CacheType, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { InteractionReplyData } from "../../utils/types.ts";

export type ComponentInteraction<Cached extends CacheType = CacheType> =
    MessageComponentInteraction<Cached> |
    ModalSubmitInteraction<Cached>;

export default abstract class Component {
    protected constructor(public customId: string) {}

    // @returns Nothing is returned when `interaction.update()` is called, otherwise, the reply is returned
    abstract execute(interaction: ComponentInteraction<"cached">): Promise<InteractionReplyData> | InteractionReplyData;
}