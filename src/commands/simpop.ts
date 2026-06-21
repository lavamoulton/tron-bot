import { Command } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { config, type QueueScope } from "../config/config";
import { buildQueuePopSendPayloadForGuild } from "../core/QueueThreadSync";
import {
    isQueueApiRequestError,
    normalizeQueueScope,
    simulateQueuePop,
} from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "simpop";
const COMMAND_DESCRIPTION = "Simulate a TST pop from real queued players without DMs";

export class SimPopCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Use !simpop to render the real waiting TST lobby with the production balancer, without queue mutation or DMs.",
            preconditions: ["Channel"],
        });
    }

    private isPrivilegedMember(member: GuildMember | null | undefined): boolean {
        if (!member) return false;
        if (member.id === member.guild.ownerId) return true;
        if (
            member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            member.permissions.has(PermissionFlagsBits.BanMembers)
        ) {
            return true;
        }
        const roleNames = new Set(
            member.roles.cache.map((role) => role.name.trim().toLowerCase())
        );
        return (
            roleNames.has("administrator") ||
            roleNames.has("admin") ||
            roleNames.has("moderator") ||
            roleNames.has("staff")
        );
    }

    private resolveScopeForChannel(channelId: string): QueueScope {
        const policyScope = (config.QUEUE_CHANNEL_POLICIES || []).find(
            (policy) => policy.channelId === channelId
        )?.scope;
        return normalizeQueueScope(policyScope || "open");
    }

    public async messageRun(message: Message) {
        if (!this.isPrivilegedMember(message.member)) {
            await message.channel.send("Only admin/mod/staff can use `!simpop`.");
            return;
        }

        const scope = this.resolveScopeForChannel(message.channel.id);
        try {
            const pop = await simulateQueuePop({ mode: "tst", scope });
            const payload = await buildQueuePopSendPayloadForGuild(pop, message.guild);
            await message.channel.send(typeof payload === "string" ? payload : payload);
        } catch (error) {
            if (isQueueApiRequestError(error) && error.status === 409) {
                const body = error.body as {
                    currentCount?: unknown;
                    requiredCount?: unknown;
                    message?: unknown;
                } | null;
                const countText =
                    typeof body?.currentCount === "number" && typeof body?.requiredCount === "number"
                        ? ` (${body.currentCount}/${body.requiredCount})`
                        : "";
                await message.channel.send(
                    `${typeof body?.message === "string" ? body.message : "TST queue is not ready."}${countText}`
                );
                return;
            }
            await message.channel.send(`Simulated pop failed: ${error instanceof Error ? error.message : "unknown error"}`);
        }
    }
}
