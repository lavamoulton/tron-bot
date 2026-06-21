import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";
import { config } from "../config/config";

// Use this to disable commands like start in production environment
const COMMAND_ENABLED = true;
const COMMAND_NAME = "pull";
const COMMAND_DESCRIPTION = "Force remove from all playlists";
const DETAILED_DESCRIPTION =
    "Type !pull <discordId|@mention> to force removal from all playlists.";

function parseDiscordUserId(token: string | undefined): string | null {
    if (!token) return null;
    const trimmed = token.trim();
    const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
    const normalized = mentionMatch ? mentionMatch[1] : trimmed;
    return /^\d{17,20}$/.test(normalized) ? normalized : null;
}

export class PullCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription: DETAILED_DESCRIPTION,
            requiredUserPermissions: ["BanMembers"],
        });
    }

    public async messageRun(message: Message) {
        let result = ``;
        const { author } = message;
        const content = message.content;
        const splitContent = content
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
        splitContent.shift();

        const targetDiscordId = parseDiscordUserId(splitContent.shift());
        if (!targetDiscordId) {
            result = "Usage: !pull <discordId|@mention>";
        } else {
            try {
                const removedUser = await container.client.users.fetch(targetDiscordId);
                result = container.manager.removeAllPlaylists(removedUser);
            } catch {
                result = `Could not find Discord user \`${targetDiscordId}\`.`;
            }
        }
        container.logger.debug(
            `New !pull message from ${author.username}: ${content} | (Result): ${result}`,
        );
        const outputId = config.OUTPUT_CHANNEL;
        if (outputId) {
            const outputChannel = await container.client.channels.fetch(outputId);
            if (outputChannel?.isTextBased()) {
                await outputChannel.send(result);
            }
        } else {
            await message.channel.send(result);
        }
    }
}
