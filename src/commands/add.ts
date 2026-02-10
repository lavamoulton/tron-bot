import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";
import { pushDiscordAddToQueueApi } from "../core/rclQueueApi";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "add";
const COMMAND_DESCRIPTION = "Add to specified playlist(s)";
const DETAILED_DESCRIPTION =
    "Type !add <playlist> to add to a specified playlist, or include multiple playlists separated by a space to add to more than one at the same time (e.g., !add fort tst wst). Typing '!add' will add you to both fort and tst by default";

export class AddCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription: DETAILED_DESCRIPTION,
            preconditions: ["Channel"],
        });
    }

    /*
    public override registerApplicationCommands(registry: ChatInputCommand.Registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(COMMAND_NAME)
                .setDescription(COMMAND_DESCRIPTION)
                .addStringOption((option) =>
                    option
                        .setName("playlists")
                        .setDescription("Playlist to add to")
                        .setRequired(false)
                        .setAutocomplete(true)
                        .setChoices(pl.loadChoices())
                )
        );
    }

    public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
        const { user } = interaction;
        const text = interaction.options.getString("playlists", true);

        let result = `Adding to playlist(s): ${text}`;
        await interaction.reply(`${result}`);
    }*/

    public async messageRun(message: Message) {
        let result = ``;
        const { author } = message;
        const content = message.content;
        const splitContent = content.split(" ");
        splitContent.shift();
        const requestedPlaylists =
            splitContent.length > 0 ? [...new Set<string>(splitContent)] : ["fort", "tst"];
        if (splitContent.length > 0) {
            const uniquePlaylists = new Set<string>(requestedPlaylists);
            result = container.manager.addToPlaylists(uniquePlaylists, author);
        } else {
            result = container.manager.addToPlaylists(["fort", "tst"], author);
        }

        const queueResult = await pushDiscordAddToQueueApi(
            requestedPlaylists,
            author.id,
            author.username
        );

        if (queueResult.attempted > 0) {
            if (queueResult.failedModes.length === 0) {
                result += `\nQueue API synced: ${queueResult.successfulModes.join(", ")}`;
            } else {
                result += `\nQueue API partial sync: ${queueResult.successfulModes.join(
                    ", "
                )} (failed: ${queueResult.failedModes.map((f) => f.mode).join(", ")})`;
            }
        }

        container.logger.debug(
            `New !add message from ${author.username}: ${content} | (Result): ${result}`,
        );
        await message.channel.send(result);
    }
}
