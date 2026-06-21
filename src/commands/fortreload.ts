import { Command, container } from "@sapphire/framework";
import { type Message } from "discord.js";
import { config } from "../config/config";
import { fortTierBalancer } from "../core/FortTierBalancer";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "reload";
const COMMAND_DESCRIPTION = "Reload Fort tier data from Google Sheets";

export class FortReloadCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            aliases: ["fortreload"],
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Allowlisted admin command: reload Fort balancing tiers from the configured Google Sheet.",
            preconditions: ["DMChannel"],
        });
    }

    private isAllowed(authorId: string): boolean {
        return config.FORT_TIER_ADMIN_IDS.includes(authorId);
    }

    public async messageRun(message: Message) {
        if (!this.isAllowed(message.author.id)) {
            await message.channel.send("Only Fort tier admins can use `!reload`.");
            return;
        }

        try {
            const result = await fortTierBalancer.reload();
            if (!result.loaded) {
                await message.channel.send("Fort tiers not configured; fallback F-tier balancing is active.");
                return;
            }
            await message.channel.send("Fort rankings reloaded.");
        } catch (error) {
            container.logger.warn(`Failed to reload Fort tiers: ${error}`);
            await message.channel.send("Failed to reload Fort tiers from Google Sheets.");
        }
    }
}
