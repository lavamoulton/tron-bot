import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "who";
const COMMAND_DESCRIPTION = "Check who is currently added to pickup";

export class WhoCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            preconditions: ["Channel"],
        });
    }

    public async messageRun(message: Message) {
        let result = ``;
        const { author } = message;
        const content = message.content;
        container.logger.debug(`New message: ${content}`);
        result = container.manager.getAddedPlayers(false);
        await message.channel.send(result);
    }
}
