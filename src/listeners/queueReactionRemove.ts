import { Listener, container } from "@sapphire/framework";
import { MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { queueLeaveMode } from "../core/rclQueueApi";
import {
    getQueueModeFromReaction,
    getQueueReactionPanelForMessage,
} from "../core/queueReactionPanel";

const REACTION_QUEUE_ENABLED = false;

async function normalizeReaction(
    reaction: MessageReaction | PartialMessageReaction
): Promise<MessageReaction | null> {
    if (!reaction.partial) return reaction;
    try {
        return await reaction.fetch();
    } catch {
        return null;
    }
}

async function normalizeUser(user: User | PartialUser): Promise<User | null> {
    if (!user.partial) return user;
    try {
        return await user.fetch();
    } catch {
        return null;
    }
}

export class QueueReactionRemoveListener extends Listener {
    public constructor(context: Listener.Context, options: Listener.Options) {
        super(context, {
            ...options,
            event: "messageReactionRemove",
        });
    }

    public async run(
        rawReaction: MessageReaction | PartialMessageReaction,
        rawUser: User | PartialUser
    ) {
        if (!REACTION_QUEUE_ENABLED) return;
        const reaction = await normalizeReaction(rawReaction);
        const user = await normalizeUser(rawUser);
        if (!reaction || !user || user.bot) return;

        const panelEntry = getQueueReactionPanelForMessage(
            reaction.message.channelId,
            reaction.message.id
        );
        if (!panelEntry) return;

        const emoji = reaction.emoji.name ?? "";
        const mode = getQueueModeFromReaction(emoji);
        if (!mode) return;

        try {
            await queueLeaveMode(mode, user.id, user.username, panelEntry.scope);
        } catch (error) {
            container.logger.warn(
                `Failed queue leave via reaction for ${user.username} (${mode}): ${error}`
            );
        }
    }
}
