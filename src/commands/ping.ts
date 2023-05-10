import { ChatInputCommand, Command } from "@sapphire/framework";
import type { Message } from "discord.js";
import { isMessageInstance } from "@sapphire/discord.js-utilities";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "ping";
const COMMAND_DESCRIPTION = "Check latency of bot";

export class PingCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            aliases: ["pong"],
            description: COMMAND_DESCRIPTION,
            preconditions: ["Channel"],
        });
    }

    public override registerApplicationCommands(registry: ChatInputCommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder.setName("ping").setDescription("Ping bot to see if it is still alive")
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const msg = await interaction.reply({
            content: `Ping?`,
            ephemeral: true,
            fetchReply: true,
        });

        if (isMessageInstance(msg)) {
            const diff = msg.createdTimestamp - interaction.createdTimestamp;
            const ping = Math.round(this.container.client.ws.ping);
            return interaction.editReply(
                `Pong 🏓! (Round trip took: ${diff}ms. Heartbeat: ${ping}ms.)`
            );
        }

        return interaction.editReply("Failed to retrieve ping :(");
    }

    public async messageRun(message: Message) {
        const msg = await message.channel.send("Ping?");

        const content = `Pong test. Bot latency ${Math.round(
            this.container.client.ws.ping
        )}ms. API latency ${msg.createdTimestamp - message.createdTimestamp}ms.`;

        return msg.edit(content);
    }
}
