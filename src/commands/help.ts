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
        const { author } = message;
        const content = message.content;
        container.logger.debug(`New message: ${content}`);
        const splitContent = content.split(" ");
        const command = splitContent.shift();
        container.logger.debug(`Split args: ${splitContent}`);
        let result = ``;
        if (splitContent.length > 0) {
            for (const arg of splitContent) {
                for (const command of container.stores.get("commands")) {
                    if (command[0] === arg) {
                        result += `**!${command[0]}**: ${command[1].detailedDescription}\n`;
                    }
                }
            }
        } else {
            result = `----- **Help** -----\n`;
            for (const command of container.stores.get("commands")) {
                if (
                    command[0] === "help" ||
                    command[0] === "ping" ||
                    command[0] === "start" ||
                    command[0] === "adminremove"
                ) {
                    continue;
                }
                result += `**!${command[0]}**: ${command[1].description}\n`;
            }
            result += `\nFor more information on any command type ***!help <command>***.`;
        }
        if (!author.dmChannel) {
            await author.createDM();
        }
        author.dmChannel?.send(result);
    }
}
