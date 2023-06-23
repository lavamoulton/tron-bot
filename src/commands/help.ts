import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "help";
const COMMAND_DESCRIPTION = "Display help menu";

export class AddCommand extends Command {
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
        let result = `----- Help -----\n`;
        for (const command of container.stores.get("commands")) {
            result += `${command[0]}: ${command[1].description}`;
        }
        result += `For more information on any command type !help <command>`;
        const { author } = message;
        if (!author.dmChannel) {
            await author.createDM();
        }
        const content = message.content;
        container.logger.debug(`New message: ${content}`);
        const splitContent = content.split(" ");
        const command = splitContent.shift();
        container.logger.debug(`Split args: ${splitContent}`);
        author.dmChannel?.send(result);
    }
}
