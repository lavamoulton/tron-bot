import { ChatInputCommand, Command } from "@sapphire/framework";
import { config, type QueueScope } from "../config/config";
import {
    getDiscordQueueStatus,
    normalizeQueueScope,
    queueJoinMode,
    queueLeaveMode,
} from "../core/rclQueueApi";

const COMMAND_NAME = "queue";

function getModeOption(interaction: Command.ChatInputCommandInteraction): string {
    return interaction.options.getString("mode", true).toLowerCase();
}

export class QueueSlashCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            name: COMMAND_NAME,
            description: "Queue management commands",
        });
    }

    private resolveScopeForChannel(channelId: string | null): QueueScope {
        const safeChannelId = String(channelId || "");
        const policyScope = (config.QUEUE_CHANNEL_POLICIES || []).find(
            (policy) => policy.channelId === safeChannelId
        )?.scope;
        return normalizeQueueScope(policyScope || "open");
    }

    public override registerApplicationCommands(registry: ChatInputCommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName("queue")
                .setDescription("Manage RCL queue participation")
                .addSubcommand((sub) =>
                    sub
                        .setName("join")
                        .setDescription("Join a queue mode")
                        .addStringOption((option) =>
                            option
                                .setName("mode")
                                .setDescription("Queue mode")
                                .setRequired(true)
                                .addChoices({ name: "tst", value: "tst" })
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName("leave")
                        .setDescription("Leave a queue mode")
                        .addStringOption((option) =>
                            option
                                .setName("mode")
                                .setDescription("Queue mode")
                                .setRequired(true)
                                .addChoices({ name: "tst", value: "tst" })
                        )
                )
                .addSubcommand((sub) =>
                    sub.setName("status").setDescription("Show your queue status and linked in-game identity")
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand(true);
        const discordId = interaction.user.id;
        const username = interaction.user.username;

        await interaction.deferReply({ ephemeral: true });

        if (subcommand === "join") {
            const mode = getModeOption(interaction);
            const scope = this.resolveScopeForChannel(interaction.channelId);
            await queueJoinMode(mode, discordId, username, scope);
            const status = await getDiscordQueueStatus(discordId, username, scope);
            const verifyTail =
                status.verificationState === "unverified"
                    ? "\nYou are currently unverified. Use `/auth` when ready to link your account."
                    : "";
            return interaction.editReply(
                `Joined **${mode}** as \`${status.playerName}\`.\nActive modes: ${
                    status.queuedModes.length ? status.queuedModes.join(", ") : "none"
                }\nScope: **${scope}**${verifyTail}`
            );
        }

        if (subcommand === "leave") {
            const mode = getModeOption(interaction);
            const scope = this.resolveScopeForChannel(interaction.channelId);
            await queueLeaveMode(mode, discordId, username, scope);
            const status = await getDiscordQueueStatus(discordId, username, scope);
            return interaction.editReply(
                `Left **${mode}** for \`${status.playerName}\`.\nRemaining modes: ${
                    status.queuedModes.length ? status.queuedModes.join(", ") : "none"
                }\nScope: **${scope}**`
            );
        }

        const scope = this.resolveScopeForChannel(interaction.channelId);
        const status = await getDiscordQueueStatus(discordId, username, scope);
        const verifyHint =
            status.verificationState === "unverified"
                ? "\nVerification: pending. Use `/auth` to link your account."
                : "\nVerification: complete.";
        const ratingLine = status.rating
            ? `\nRating: ${status.rating.value ?? "unknown"} (${status.rating.source || "unknown"})`
            : "";
        return interaction.editReply(
            `Identity: \`${status.playerName}\`\nQueued modes: ${
                status.queuedModes.length ? status.queuedModes.join(", ") : "none"
            }\nScope: **${scope}**${ratingLine}${verifyHint}`
        );
    }
}
