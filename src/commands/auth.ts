import { ChatInputCommand, Command } from "@sapphire/framework";
import { createDiscordVerificationLink } from "../core/rclQueueApi";

export class AuthSlashCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            name: "auth",
            description: "Link your Discord to your RCL account",
        });
    }

    public override registerApplicationCommands(registry: ChatInputCommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName("auth")
                .setDescription("Get a link to connect your Discord to your RCL account")
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const discordId = interaction.user.id;
        const username = interaction.user.username;

        await interaction.deferReply({ ephemeral: true });

        const link = await createDiscordVerificationLink(discordId, username);
        if (!link.verifyUrl) {
            return interaction.editReply(
                "Could not generate a link right now. Please try again later."
            );
        }

        return interaction.editReply(
            `**Link your Discord to RCL**\n\n` +
                `Click below to log in and link your account:\n${link.verifyUrl}\n\n` +
                `If you already have an RCL account, just log in and it will link automatically.\n` +
                `If you don't have one yet, sign up and your Discord identity will be connected.`
        );
    }
}
