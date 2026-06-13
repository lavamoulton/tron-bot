import { Precondition } from "@sapphire/framework";
import { Channel, Message } from "discord.js";
import { config } from "../config/config";

function resolveAllowedChannelIds(): string[] {
    const fromPolicies = (config.QUEUE_CHANNEL_POLICIES || []).map((policy) => policy.channelId);
    const legacy = config.OUTPUT_CHANNEL ? [config.OUTPUT_CHANNEL] : [];
    return [...new Set([...fromPolicies, ...legacy].filter(Boolean))];
}

export class DMChannelPrecondition extends Precondition {
    public override async messageRun(message: Message) {
        this.container.logger.debug(`New message: ${message.content}`);
        return this.checkChannel(message.channel);
    }

    private async checkChannel(channel: Channel) {
        const allowedChannelIds = resolveAllowedChannelIds();
        this.container.logger.debug(
            `Message channel: ${channel.id}, allowed channels: ${allowedChannelIds.join(",")}`
        );
        if (channel.isDMBased()) {
            return this.ok();
        }
        return allowedChannelIds.includes(channel.id)
            ? this.ok()
            : this.error({ message: `Incorrect channel.` });
    }
}

declare module "@sapphire/framework" {
    interface Preconditions {
        DMChannel: never;
    }
}
