import {
    APIEmbedField,
    ApplicationCommandOptionType,
    ChatInputCommandInteraction,
    EmbedBuilder,
    GuildTextBasedChannel,
    Snowflake,
    time,
    TimestampStyles,
    userMention
} from "discord.js";

import { InteractionReplyData } from "@utils/types";
import { DEFAULT_EMBED_COLOR, DURATION_FORMAT, EMBED_FIELD_CHAR_LIMIT } from "@utils/constants";
import { client, prisma } from "./..";
import { pluralize } from "@/utils";
import { InfractionUtil } from "@utils/infractions";

import Command from "@managers/commands/Command";
import ConfigManager from "@managers/config/ConfigManager";
import ms from "ms";
import Sentry from "@sentry/node";
import Logger, { AnsiColor } from "@utils/logger";

export default class Reminders extends Command<ChatInputCommandInteraction<"cached">> {
    constructor() {
        super({
            name: "reminders",
            description: "Create a reminder",
            options: [
                {
                    name: ReminderSubcommand.Add,
                    description: "Create a reminder",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "duration",
                            description: "How long to wait before sending the reminder",
                            type: ApplicationCommandOptionType.String,
                            required: true
                        },
                        {
                            name: "reminder",
                            description: "The message to remind you",
                            type: ApplicationCommandOptionType.String,
                            max_length: EMBED_FIELD_CHAR_LIMIT,
                            required: true
                        }
                    ]
                },
                {
                    name: ReminderSubcommand.List,
                    description: "List your reminders",
                    type: ApplicationCommandOptionType.Subcommand
                },
                {
                    name: ReminderSubcommand.Clear,
                    description: "Clear all your reminders",
                    type: ApplicationCommandOptionType.Subcommand
                },
                {
                    name: ReminderSubcommand.Remove,
                    description: "Delete a reminder",
                    type: ApplicationCommandOptionType.Subcommand,
                    options: [
                        {
                            name: "reminder_id",
                            description: "The ID of the reminder to delete",
                            type: ApplicationCommandOptionType.String,
                            required: true
                        }
                    ]
                }
            ]
        });
    }

    execute(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const subcommand = interaction.options.getSubcommand(true) as ReminderSubcommand;

        switch (subcommand) {
            case ReminderSubcommand.Add:
                return Reminders._create(interaction);
            case ReminderSubcommand.List:
                return Reminders._list(interaction);
            case ReminderSubcommand.Clear:
                return Reminders._clear(interaction);
            case ReminderSubcommand.Remove:
                return Reminders._delete(interaction);
            default:
                return Promise.resolve("Unknown subcommand");
        }
    }

    private static async _create(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        if (!interaction.channel) {
            return "Failed to fetch the channel";
        }

        const reminderCount = await prisma.reminder.count({
            where: {
                author_id: interaction.user.id
            }
        });

        if (reminderCount === 10) {
            return "You cannot create more than 10 reminders at a time";
        }

        const config = ConfigManager.getGuildConfig(interaction.guildId, true);

        if (config.channelInScope(interaction.channel)) {
            return "Reminders can only be created in non-ephemeral channels";
        }

        const duration = interaction.options.getString("duration", true);

        if (!DURATION_FORMAT.test(duration)) {
            return "Invalid duration format";
        }

        DURATION_FORMAT.lastIndex = 0;

        const msExpiresAt = Date.now() + ms(duration);
        const expiresAt = new Date(msExpiresAt);
        const reminder = interaction.options.getString("reminder", true);
        const createdAt = new Date();

        try {
            const { id } = await prisma.reminder.create({
                data: {
                    expires_at: expiresAt,
                    channel_id: interaction.channel.id,
                    author_id: interaction.user.id,
                    reminder
                }
            });

            setTimeout(async () => {
                const reminderMessage = Reminders._formatReminder(interaction.user.id, reminder, createdAt);

                await Promise.all([
                    prisma.reminder.deleteMany({ where: { id } }),
                    interaction.channel!.send(reminderMessage)
                ]);
            }, msExpiresAt - Date.now());
        } catch (error) {
            const sentryId = Sentry.captureException(error);
            return `An error occurred while creating the reminder (\`${sentryId}\`)`;
        }

        const relativeTimestamp = time(expiresAt, TimestampStyles.RelativeTime);
        const formattedReminder = InfractionUtil.formatReason(reminder);

        return `I will remind you ${relativeTimestamp} ${formattedReminder}`;
    }

    private static async _list(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const reminders = await prisma.reminder.findMany({
            where: { author_id: interaction.user.id }
        });

        if (!reminders.length) {
            return "You do not have any reminders";
        }

        const fields: APIEmbedField[] = reminders.map(reminder => ({
            name: `${time(reminder.expires_at, TimestampStyles.ShortDateTime)} | ID: ${reminder.id}`,
            value: reminder.reminder
        }));

        const embed = new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setAuthor({ name: `@${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle("Reminders")
            .setFields(fields);

        return { embeds: [embed] };
    }

    private static async _clear(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const clearedReminders = await prisma.reminder.deleteMany({
            where: { author_id: interaction.user.id }
        });

        if (!clearedReminders.count) {
            return "You do not have any reminders to clear";
        }

        return `Successfully cleared \`${clearedReminders.count}\` ${pluralize(clearedReminders.count, "reminder")}`;
    }

    private static async _delete(interaction: ChatInputCommandInteraction<"cached">): Promise<InteractionReplyData> {
        const reminderId = interaction.options.getString("reminder_id", true);
        const deletedReminder = await prisma.reminder.delete({
            where: {
                id: reminderId,
                author_id: interaction.user.id
            }
        }).catch(() => null);

        if (!deletedReminder) {
            return `Reminder with ID \`${reminderId}\` not found`;
        }

        return `Successfully deleted reminder with ID \`${reminderId}\``;
    }

    private static _formatReminder(authorId: Snowflake, reminder: string, createdAt: Date): string {
        const relativeTimestamp = time(createdAt, TimestampStyles.RelativeTime);
        return `${userMention(authorId)} You asked me to remind you ${relativeTimestamp}\n\n> ${reminder}`;
    }

    static async mount(): Promise<void> {
        Logger.log("REMINDERS", "Mounting reminders...", {
            color: AnsiColor.Purple
        });

        const reminders = await prisma.reminder.findMany();

        if (!reminders.length) {
            Logger.log("REMINDERS", "No reminders to mount", {
                color: AnsiColor.Purple
            });
            return;
        }

        for (const reminder of reminders) {
            const reminderMessage = Reminders._formatReminder(reminder.author_id, reminder.reminder, reminder.created_at);
            const channel = await client.channels.fetch(reminder.channel_id) as GuildTextBasedChannel;
            const user = await client.users.fetch(reminder.author_id);

            setTimeout(async () => {
                await Promise.all([
                    prisma.reminder.deleteMany({ where: { id: reminder.id } }),
                    channel.send(reminderMessage)
                ]);
            }, reminder.expires_at.getTime() - Date.now());

            Logger.info(`Mounted reminder with ID ${reminder.id} for @${user.username} (${user.id}) in #${channel.name} (${channel.id})`);
        }

        Logger.log("REMINDERS", `Successfully mounted ${reminders.length} ${pluralize(reminders.length, "reminder")}`, {
            color: AnsiColor.Purple
        });
    }
}

enum ReminderSubcommand {
    Add = "add",
    List = "list",
    Clear = "clear",
    Remove = "remove"
}