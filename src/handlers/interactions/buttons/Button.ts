import { CustomComponentProperties } from "../../../utils/Types";
import { ButtonInteraction } from "discord.js";

import Config from "../../../utils/Config";

export default abstract class Button {
    // @formatter:off
    // eslint-disable-next-line no-empty-function
    protected constructor(public data: CustomComponentProperties) {}
    abstract execute(interaction: ButtonInteraction, ephemeral: boolean, config: Config): Promise<void>;
}