import { Args, ChatInputCommand, Command } from "@sapphire/framework";
import type { Message } from "discord.js";
import { isMessageInstance } from "@sapphire/discord.js-utilities";
import { pl } from "../playlists/playlists";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "add";
const COMMAND_DESCRIPTION = "Add to specified playlist(s)";

export class AddCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
        });
    }

    public override registerApplicationCommands(registry: ChatInputCommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder.setName(COMMAND_NAME).setDescription(COMMAND_DESCRIPTION)
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const { user } = interaction;
        const text = interaction.options.getString("playlists", true);

        let result = `Adding to playlist(s): ${text}`;
        await interaction.reply(`${result}`);
    }

    public async messageRun(message: Message, args: Args) {
        const { author } = message;
        const options = message.content.toLowerCase().split(" ").slice(1);

        let result = ``;

        if (options.length === 0) {
            result += pl.addToPlaylist("fort", author, playlists);
            result += pl.addToPlaylist("tst", author, playlists);
            await message.channel.send(`${result}`);
        } else {
            for (let i in options) {
                let option = options[i];
                if (option in playlists) {
                    result += pl.addToPlaylist(option, author, playlists);
                }
            }
            await message.channel.send(`${result}`);
        }

        const content = `Pong test. Bot latency ${Math.round(
            this.container.client.ws.ping
        )}ms. API latency ${msg.createdTimestamp - message.createdTimestamp}ms.`;

        return msg.edit(content);
    }
}
