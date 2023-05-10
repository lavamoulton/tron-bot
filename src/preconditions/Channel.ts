import { Precondition } from "@sapphire/framework";
import { Channel, Message } from "discord.js";
import { config } from "../config/config";

export class ChannelPrecondition extends Precondition {
    public override async messageRun(message: Message) {
        this.container.logger.debug(`New message: ${message.content}`);
        return this.checkChannel(message.channel);
    }

    private async checkChannel(channel: Channel) {
        this.container.logger.debug(
            `Message channel: ${channel.id}, Output channel: ${config.OUTPUT_CHANNEL}`
        );
        return config.OUTPUT_CHANNEL === channel.id
            ? this.ok()
            : this.error({ message: `Incorrect channel.` });
    }
}

declare module "@sapphire/framework" {
    interface Preconditions {
        Channel: never;
    }
}
