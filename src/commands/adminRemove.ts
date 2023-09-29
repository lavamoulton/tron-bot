import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "adminRemove";
const COMMAND_DESCRIPTION = "Remove a specific player";

export class RemoveCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            preconditions: ["Channel"],
            requiredUserPermissions: ["BanMembers"],
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
            result = container.manager.removeIDFromPlaylists(splitContent[0]);
        } else {
            container.logger.error(`Did not find player input`);
            await message.channel.send(
                `Please type *'!adminRemove <id>'* to remove a player`
            );
        }
        await message.channel.send(result);
    }
}
