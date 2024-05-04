import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    Colors,
    EmbedBuilder,
    GuildMember
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { Snowflake } from "discord-api-types/v10";
import { userMentionWithId } from "@/utils";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

/**
 * Censors a member's nickname by changing it to "Unverified User XXXXX".
 * The following requirements must be met for the command to be successful:
 *
 * 1. The target member must be in the server.
 * 2. The target member must not have any roles.
 * 3. The target member must be manageable by the bot.
 *
 * Upon changing the nickname, the command will log the action in the channel configured for
 * {@link LoggingEvent.InfractionCreate} logs
 */
export default class CensorNickname extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "censor",
            description: "Censors a member's nickname",
            options: [{
                name: "nickname",
                description: "Censors a member's nickname",
                type: ApplicationCommandOptionType.Subcommand,
                options: [{
                    name: "member",
                    description: "The member to censor",
                    type: ApplicationCommandOptionType.User,
                    required: true
                }]
            }]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const config = ConfigManager.getGuildConfig(interaction.guildId, true);
        const member = interaction.options.getMember("member");

        return CensorNickname.handle(interaction.user.id, member, config);
    }

    static async handle(executorId: Snowflake, target: GuildMember | null, config: GuildConfig): Promise<InteractionReplyData> {
        if (!target) {
            return "You can't censor the nickname of someone who isn't in the server";
        }

        if (target.roles.cache.size) {
            return "You can't censor the nickname of someone who has roles";
        }

        if (!target.manageable) {
            return "I do not have permission to censor this user's nickname";
        }

        // Random 5-digit number
        const rand = Math.floor(Math.random() * 90000) + 10000;
        const initialNickname = target.displayName;
        const censoredNickname = `Unverified User ${rand}`;

        // Update the user's nickname
        await target.setNickname(censoredNickname, `Inappropriate nickname, censored by ${executorId}`);

        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setAuthor({ name: "Nickname Censored" })
            .setFields([
                {
                    name: "Executor",
                    value: userMentionWithId(executorId)
                },
                {
                    name: "Target",
                    value: userMentionWithId(target.id)
                },
                {
                    name: "Old Nickname",
                    value: initialNickname
                },
                {
                    name: "New Nickname",
                    value: censoredNickname
                }
            ])
            .setTimestamp();

        // Log the nickname censorship
        log({
            event: LoggingEvent.InfractionCreate,
            message: { embeds: [embed] },
            channel: null,
            config
        });

        return `Changed ${target}'s nickname from \`${initialNickname}\` to \`${censoredNickname}\``;
    }
}