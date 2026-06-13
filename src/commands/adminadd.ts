import { Command, container } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import {
    getDiscordQueueStatus,
    normalizeQueueScope,
    pushDiscordAddToQueueApi,
} from "../core/rclQueueApi";
import { config, type QueueScope } from "../config/config";
import {
    compactText,
    defaultQueueModesForScope,
    isQueueModeAllowedInScope,
    normalizeQueueModeInput,
    queueModeShortLabel,
    sortQueueModes,
    type QueueCanonicalMode,
} from "../core/queuePresentation";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "adminadd";
const COMMAND_DESCRIPTION = "Admin force-add a user to pickup queue mode(s)";
const DETAILED_DESCRIPTION =
    "Use !adminadd <discordId|@mention> [mode...] to queue a target user for testing pops.";

type AddSyncResult = Awaited<ReturnType<typeof pushDiscordAddToQueueApi>>;

function formatModeToken(mode: string): string {
    const canonical = normalizeQueueModeInput(mode);
    return canonical ? `\`${queueModeShortLabel(canonical)}\`` : `\`${mode.toUpperCase()}\``;
}

function formatModeTokenList(modes: string[]): string {
    if (modes.length === 0) return "_none_";
    return modes.map((mode) => formatModeToken(mode)).join(", ");
}

function summarizeAddResult(result: AddSyncResult): {
    title: string;
    status: "success" | "partial" | "error" | "info";
    detailLines: string[];
} {
    if (result.attempted === 0) {
        return {
            title: "No valid mode provided",
            status: "info",
            detailLines: ["Use `!adminadd <id> fort`, `!adminadd <id> tst`, `!adminadd <id> sumobar`, `!adminadd <id> wst`, `!adminadd <id> ctf`, or `!adminadd <id> 4tf`."],
        };
    }

    if (result.failedModes.length === 0) {
        return {
            title: "Queue updated",
            status: "success",
            detailLines: [`Added: ${formatModeTokenList(result.successfulModes)}`],
        };
    }

    if (result.successfulModes.length === 0) {
        const firstReason = compactText(result.failedModes[0]?.error || "Target user cannot queue in this lane.");
        return {
            title: "Join blocked",
            status: "error",
            detailLines: [`**Admin add blocked: ${firstReason}**`],
        };
    }

    return {
        title: "Partially updated",
        status: "partial",
        detailLines: [
            `Added: ${formatModeTokenList(result.successfulModes)}`,
            ...result.failedModes.map((item) => `• **${item.mode}**: ${compactText(item.error)}`),
        ],
    };
}

function parseDiscordUserId(token: string | undefined): string | null {
    if (!token) return null;
    const trimmed = token.trim();
    const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
    const normalized = mentionMatch ? mentionMatch[1] : trimmed;
    return /^\d{17,20}$/.test(normalized) ? normalized : null;
}

export class AdminAddCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription: DETAILED_DESCRIPTION,
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

    private normalizeRequestedModes(playlists: string[], scope: QueueScope): QueueCanonicalMode[] {
        const normalized = playlists
            .map((playlist) => normalizeQueueModeInput(playlist))
            .filter((mode): mode is QueueCanonicalMode => Boolean(mode))
            .filter((mode) => isQueueModeAllowedInScope(mode, scope));
        return sortQueueModes(Array.from(new Set(normalized)));
    }

    private async resolveDefaultQueues(
        discordId: string,
        username: string,
        scope: QueueScope
    ): Promise<string[]> {
        const fallbackModes = defaultQueueModesForScope(scope);
        try {
            const status = await getDiscordQueueStatus(discordId, username, scope);
            if (status.defaultQueues && status.defaultQueues.length > 0) {
                const normalized = this.normalizeRequestedModes(status.defaultQueues, scope);
                if (normalized.length > 0) {
                    return normalized;
                }
            }
        } catch (error) {
            container.logger.debug(`Failed to fetch defaults for admin target ${username}: ${error}`);
        }
        return fallbackModes;
    }

    private async resolveTargetUsername(message: Message, discordId: string): Promise<string> {
        try {
            if (message.guild) {
                const member = await message.guild.members.fetch(discordId);
                const username = member?.user?.username;
                if (username) return username;
            }
        } catch {
            // Fall through to global user lookup.
        }
        try {
            const user = await container.client.users.fetch(discordId);
            if (user?.username) return user.username;
        } catch {
            // Fall through to deterministic fallback.
        }
        return `discord-${discordId}`;
    }

    public async messageRun(message: Message) {
        const { author } = message;
        const content = message.content;
        const scope = this.resolveScopeForChannel(message.channel.id);
        const splitContent = content
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length > 0);
        splitContent.shift();

        const rawTarget = splitContent.shift();
        const targetDiscordId = parseDiscordUserId(rawTarget);
        if (!targetDiscordId) {
            await message.channel.send("Usage: !adminadd <discordId|@mention> [fort|tst|sumobar|wst|ctf|4tf]");
            return;
        }

        const canManageOthers = this.isPrivilegedMember(message.member);
        if (targetDiscordId !== author.id && !canManageOthers) {
            await message.channel.send(
                "You can only adminadd your own Discord ID unless you have admin/mod permissions."
            );
            return;
        }

        const targetUsername = await this.resolveTargetUsername(message, targetDiscordId);
        let requestedPlaylists: string[];
        if (splitContent.length > 0) {
            requestedPlaylists = [...new Set<string>(splitContent.map((token) => token.toLowerCase()))];
        } else {
            requestedPlaylists = await this.resolveDefaultQueues(targetDiscordId, targetUsername, scope);
        }

        const queueResult = await pushDiscordAddToQueueApi(
            requestedPlaylists,
            targetDiscordId,
            targetUsername,
            { scope }
        );

        const summary = summarizeAddResult(queueResult);
        const detailLines = [...summary.detailLines];
        if (queueResult.skippedPlaylists.length > 0) {
            detailLines.push(`Ignored unsupported modes: ${queueResult.skippedPlaylists.join(", ")}`);
        }

        container.logger.debug(
            `New !adminadd from ${author.username}: ${content} | target=${targetUsername} (${targetDiscordId}) | result=${summary.title}`
        );

        const targetTag = `\`${targetUsername}\` (\`${targetDiscordId}\`)`;

        if (summary.status === "success") {
            await message.channel.send(
                `Admin add ok for ${targetTag}: ${formatModeTokenList(queueResult.successfulModes)}`
            );
            return;
        }

        if (summary.status === "partial") {
            const reason = compactText(
                queueResult.failedModes[0]?.error || "Some requested modes could not be added."
            );
            await message.channel.send(`Admin add partial for ${targetTag}: ${reason}`);
            return;
        }

        if (summary.status === "error") {
            const reason = detailLines[0] || "Join blocked.";
            await message.channel.send(`${targetTag}: ${reason.replace(/^\*\*|\*\*$/g, "")}`);
            return;
        }

        const info = detailLines[0] || "No valid mode provided.";
        await message.channel.send(`${targetTag}: ${info}`);
    }
}
