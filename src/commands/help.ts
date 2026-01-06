import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "help";
const COMMAND_DESCRIPTION = "Display help menu";

// ADD A HELP COMMAND TO SEND HELP MESSAGES TO A NEW USER

export class HelpCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            preconditions: ["DMChannel"],
        });
    }

    public async messageRun(message: Message) {
        const { author } = message;
        const content = message.content;
        const splitContent = content.split(" ");
        const command = splitContent.shift();
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
            result = `**Join a pickup:**\n`;
            result += `\`!add <mode>\` - or just \`!add\` to queue for fort + tst\n\n`;

            result += `**Available modes:**\n`;
            for (const playlistName in container.manager.playlists) {
                if (playlistName.includes("test")) {
                    continue;
                }
                const playlist = container.manager.playlists[playlistName];
                result += `\`${playlist.name}\` - ${playlist.description}\n`;
            }

            result += `\n**Leave a pickup:**\n`;
            result += `\`!remove <mode>\` - or just \`!remove\` to leave all queues\n\n`;

            result += `:warning: **Pickup etiquette:** :warning:\n`;
            result += `Adding means you're ready to play promptly and stay for the full match (**~40 min**). If you can't make it, find a sub. Repeated no-shows may result in a pickup ban.`;
            /*for (const command of container.stores.get("commands")) {
                if (command[0] === "help" || command[0] === "ping") {
                    continue;
                }
                result += `**!${command[0]}**: ${command[1].description}\n`;
            }
            result += `\nFor more information on any command type ***!help <command>***.`;*/
        }
        if (!author.dmChannel) {
            await author.createDM();
        }

        container.logger.debug(
            `New !help message from ${author.username}: ${content} | (Result): ${result}`
        );
        author.dmChannel?.send(result);
    }
}
