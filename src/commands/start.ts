import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";
import { config } from "../config/config";

// Use this to disable commands like start in production environment
let COMMAND_ENABLED = false;
if (config.ENVIRONMENT === "development") {
    COMMAND_ENABLED = true;
}
const COMMAND_NAME = "start";
const COMMAND_DESCRIPTION = "Start specified playlists";
const DETAILED_DESCRIPTION = "Type !start <playlist> to test a specific playlist";

export class StartCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription: DETAILED_DESCRIPTION,
            preconditions: ["DMChannel"],
            requiredUserPermissions: ["BanMembers"],
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
            splitContent.forEach((name) => {
                result += container.manager.forceStartPlaylist(name);
            });
        }
        await message.channel.send(result);
    }
}
