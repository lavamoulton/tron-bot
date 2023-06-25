import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "stats";
const COMMAND_DESCRIPTION = "Display stats for a specific player";
const DETAILED_DESCRIPTION =
    "Displays stats for yourself if no argument is provided, or accepts a user ID as an argument";

export class StatsCommand extends Command {
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
            result = container.manager.getStats(splitContent[0]);
        } else {
            result = container.manager.getStats(author.id);
        }
        if (!author.dmChannel) {
            await author.createDM();
        }
        author.dmChannel?.send(result);
    }
}
