import { Precondition } from "@sapphire/framework";
import { Channel, GuildMember, Message } from "discord.js";
import { config } from "../config/config";

export class ModPrecondition extends Precondition {
    public override async messageRun(message: Message) {
        this.container.logger.debug(`New message: ${message.content}`);
        return this.checkLevel(message.member);
    }

    private async checkLevel(member: GuildMember | null) {
        if (!member) {
            this.container.logger.debug(`Member not found.`);
            return this.error({ message: `This command must be run from a server.` });
        }

        const roleNames = ["Moderator", "Administrator"];

        const hasRole = member.roles.cache.some((r) => roleNames.includes(r.name));

        return hasRole
            ? this.ok()
            : this.error({ message: `You do not have permission to use this command.` });
    }
}

declare module "@sapphire/framework" {
    interface Preconditions {
        Mod: never;
    }
}
