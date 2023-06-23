import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

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
        container.logger.debug(`New message: ${content}`);
        const splitContent = content.split(" ");
        const command = splitContent.shift();
        container.logger.debug(`Split args: ${splitContent}`);
        if (splitContent.length > 0) {
            result = container.manager.addToPlaylists(splitContent, author);
        } else {
            result = container.manager.addToPlaylists(["fort", "tst"], author);
        }
        await message.channel.send(result);
    }
}
