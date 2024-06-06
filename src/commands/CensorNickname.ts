import {
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    Colors,
    EmbedBuilder,
    GuildMember
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { Snowflake } from "discord-api-types/v10";
import { randInt, userMentionWithId } from "@/utils";
import { log } from "@utils/logging";
import { LoggingEvent } from "@managers/config/schema";

import GuildConfig from "@managers/config/GuildConfig";
import ConfigManager from "@managers/config/ConfigManager";
import Command from "@managers/commands/Command";

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

        const { exclude_roles, nickname, exclusion_response } = config.data.nickname_censorship;

        // Check if any of the user's roles are excluded from censorship
        if (exclude_roles.some(role => target.roles.cache.has(role))) {
            return exclusion_response;
        }

        if (!target.manageable) {
            return "I do not have permission to censor this user's nickname";
        }

        const initialNickname = target.displayName;
        const censoredNickname = CensorNickname._formatCensoredNickname(nickname, target.id);

        await target.setNickname(censoredNickname, `Nickname censored by ${executorId}`);

        CensorNickname._log({
            executorId,
            targetId: target.id,
            initialNickname,
            censoredNickname,
            config
        });

        return `Successfully changed ${target}'s nickname from \`${initialNickname}\` to \`${censoredNickname}\``;
    }

    private static _formatCensoredNickname(nickname: string, targetId: Snowflake): string {
        const rand = randInt(10000, 99999);

        return nickname
            .replace("$RAND", rand.toString())
            .replace("$USER_ID", targetId);
    }

    private static _log(data: {
        executorId: Snowflake;
        targetId: Snowflake;
        initialNickname: string;
        censoredNickname: string;
        config: GuildConfig;
    }): void {
        const { executorId, targetId, initialNickname, censoredNickname, config } = data;

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
                    value: userMentionWithId(targetId)
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
    }
}