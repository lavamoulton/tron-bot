import { Command, container } from "@sapphire/framework";
import type { Message } from "discord.js";
import {
    getQueueRegionPreference,
    isQueueApiRequestError,
    setQueueRegionPreference,
} from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "prefer";
const COMMAND_DESCRIPTION = "Set pickup server region preference order";

export class PreferCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
        });
    }

    public async messageRun(message: Message) {
        const { author, content } = message;
        const args = content.trim().split(/\s+/).slice(1).join(" ").trim();

        try {
            if (!args) {
                const current = await getQueueRegionPreference(author.id);
                const formatted = current.formatted || "UK NY SF MTL";
                await message.channel.send(
                    `**Your pickup region preference:** ${formatted}\n` +
                        `Set with \`!prefer mtl sf ny uk\` (first = most preferred).`
                );
                return;
            }

            const saved = await setQueueRegionPreference(author.id, args, author.username);
            await message.channel.send(
                `Saved pickup region preference: **${saved.formatted}**\n` +
                    `Pop DMs will use your top available region; lobby picks weigh everyone's prefs.`
            );
        } catch (error) {
            container.logger.warn(`!prefer failed for ${author.id}: ${error}`);
            const detail = isQueueApiRequestError(error)
                ? error.message
                : "Could not save preference. Try `!prefer mtl sf ny uk`.";
            await message.channel.send(detail);
        }
    }
}
