import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "remove";
const COMMAND_DESCRIPTION = "Remove from specified playlist(s)";
const DETAILED_DESCRIPTION =
    "Typing '!remove' will remove you from all playlists. Type !remove <playlist> to remove from a specified playlist, or include multiple playlists separated by a space to remove from more than one at the same time (e.g., !remove fort tst wst).";

export class RemoveCommand extends Command {
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

    public async messageRun(message: Message) {
        let result = ``;
        const { author } = message;
        const content = message.content;
        container.logger.debug(`New message: ${content}`);
        const splitContent = content.split(" ");
        const command = splitContent.shift();
        container.logger.debug(`Split args: ${splitContent}`);
        if (splitContent.length > 0) {
            result = container.manager.removeFromPlaylists(splitContent, author, false);
        } else {
            result = container.manager.removeAllPlaylists(author);
        }
        await message.channel.send(result);
    }
}
