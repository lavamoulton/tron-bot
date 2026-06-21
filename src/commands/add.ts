import { Command, container } from "@sapphire/framework";
import type { Guild, GuildEmoji, Message } from "discord.js";
import {
    getDiscordQueueStatus,
    getQueueModeState,
    normalizeQueueScope,
    pushDiscordAddToQueueApi,
    type QueueModeStateEntry,
} from "../core/rclQueueApi";
import { config, type QueueScope } from "../config/config";
import {
    compactText,
    defaultQueueModesForScope,
    isQueueModeAllowedInScope,
    normalizeQueueModeInput,
    queueModeShortLabel,
    resolveQueueTier,
    sortQueueModes,
    type QueueTier,
    type QueueCanonicalMode,
} from "../core/queuePresentation";
import { resolvePlayerDisplayNamesBySource } from "../core/discordDisplayNames";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "add";
const COMMAND_DESCRIPTION = "Join pickup queue mode(s)";
const DETAILED_DESCRIPTION =
    "Use !add <mode> (fort, tst, sumobar, wst, ctf, 4tf). !add with no mode joins default modes for this lane.";

type AddSyncResult = Awaited<ReturnType<typeof pushDiscordAddToQueueApi>>;

const MODE_LINE_LABELS: Record<QueueCanonicalMode, string> = {
    fort: "Fortress",
    tst: "TST",
    sumo: "Sumobar",
    wst: "WST",
    ctf4v4: "CTF",
    "4tf": "4TF",
    spare1: "Testing",
    spare2: "Utility",
};

const TIER_EMOJI_TERMS: Record<QueueTier, string[]> = {
    bronze: ["bronze"],
    silver: ["silver"],
    gold: ["gold"],
    platinum: ["platinum"],
    diamond: ["diamond"],
    amethyst: ["amethyst", "diamondamethyst", "amethystdiamond", "diamond"],
    master: ["master"],
    grandmaster: ["grandmaster", "grand_master"],
    legend: ["legend"],
};

function normalizeEmojiName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
            detailLines: ["Use `!add fort`, `!add tst`, `!add sumobar`, `!add wst`, `!add ctf`, or `!add 4tf`."],
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
        const firstReason = compactText(result.failedModes[0]?.error || "You cannot queue in this lane.");
        return {
            title: "Join blocked",
            status: "error",
            detailLines: [`**You can't queue here: ${firstReason}**`],
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

export class AddCommand extends Command {
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
            container.logger.debug(`Failed to fetch user defaults for ${username}: ${error}`);
        }
        return fallbackModes;
    }

    private normalizeModesForSnapshot(rawModes: string[], scope: QueueScope): QueueCanonicalMode[] {
        return this.normalizeRequestedModes(rawModes, scope);
    }

    private findBestRankEmoji(
        emojis: GuildEmoji[],
        terms: string[]
    ): GuildEmoji | null {
        let best: GuildEmoji | null = null;
        let bestScore = -1;
        const normalizedTerms = terms.map((term) => normalizeEmojiName(term)).filter(Boolean);
        for (const emoji of emojis) {
            const normalizedName = normalizeEmojiName(emoji.name || "");
            if (!normalizedName) continue;
            for (const term of normalizedTerms) {
                let score = -1;
                if (normalizedName === term) score = 300;
                else if (normalizedName.startsWith(term) || normalizedName.endsWith(term)) score = 200;
                else if (normalizedName.includes(term)) score = 100;
                if (score > bestScore) {
                    bestScore = score;
                    best = emoji;
                }
            }
        }
        return bestScore >= 0 ? best : null;
    }

    private async buildTierEmojiLookup(
        guild: Guild | null | undefined
    ): Promise<Partial<Record<QueueTier, string>>> {
        const lookup: Partial<Record<QueueTier, string>> = {};
        if (!guild) return lookup;
        if (guild.emojis.cache.size === 0) {
            await guild.emojis.fetch().catch(() => undefined);
        }
        const emojis = [...guild.emojis.cache.values()];
        if (emojis.length === 0) return lookup;
        const tiers = Object.keys(TIER_EMOJI_TERMS) as QueueTier[];
        for (const tier of tiers) {
            const emoji = this.findBestRankEmoji(emojis, TIER_EMOJI_TERMS[tier]);
            if (emoji) lookup[tier] = emoji.toString();
        }
        return lookup;
    }

    private formatRoster(
        entries: QueueModeStateEntry[],
        tierEmojiLookup: Partial<Record<QueueTier, string>>,
        displayNameByPlayerName: Map<string, string>
    ): string {
        if (entries.length === 0) return "empty";
        return entries
            .map((entry) => {
                const tier = resolveQueueTier(entry.ratingElo);
                const marker = tier ? tierEmojiLookup[tier] || "" : "";
                const displayName = displayNameByPlayerName.get(entry.playerName) || entry.playerName;
                return marker ? `${marker} ${displayName}` : displayName;
            })
            .join(", ");
    }

    private async buildQueueSnapshotLines(
        scope: QueueScope,
        modes: QueueCanonicalMode[],
        guild: Guild | null | undefined
    ): Promise<string[]> {
        const tierEmojiLookup = await this.buildTierEmojiLookup(guild);
        const uniqueModes = sortQueueModes(Array.from(new Set(modes)));
        const lines: string[] = [];
        for (const mode of uniqueModes) {
            try {
                const queueState = await getQueueModeState(mode, scope);
                const displayNameByPlayerName = await resolvePlayerDisplayNamesBySource(
                    guild,
                    this.container.client,
                    queueState.mode.entries.map((entry) => ({
                        playerName: entry.playerName,
                        sourceServer: entry.sourceServer || null,
                    }))
                );
                lines.push(
                    `${MODE_LINE_LABELS[mode]} (${queueState.mode.currentCount} / ${queueState.mode.requiredCount}): ${this.formatRoster(queueState.mode.entries, tierEmojiLookup, displayNameByPlayerName)}`
                );
            } catch (error) {
                container.logger.warn(`Failed reading queue state for ${mode}/${scope}: ${error}`);
                lines.push(`${MODE_LINE_LABELS[mode]}: unavailable`);
            }
        }
        return lines;
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

        let requestedPlaylists: string[];
        if (splitContent.length > 0) {
            requestedPlaylists = [...new Set<string>(splitContent.map((token) => token.toLowerCase()))];
        } else {
            requestedPlaylists = await this.resolveDefaultQueues(author.id, author.username, scope);
        }

        const queueResult = await pushDiscordAddToQueueApi(
            requestedPlaylists,
            author.id,
            author.username,
            { scope }
        );

        const summary = summarizeAddResult(queueResult);
        const detailLines = [...summary.detailLines];
        if (queueResult.skippedPlaylists.length > 0) {
            detailLines.push(`Ignored unsupported modes: ${queueResult.skippedPlaylists.join(", ")}`);
        }

        container.logger.debug(
            `New !add message from ${author.username}: ${content} | (Result): ${summary.title}`,
        );

        const snapshotModes = this.normalizeModesForSnapshot(
            [
                ...requestedPlaylists,
                ...queueResult.successfulModes,
                ...queueResult.failedModes.map((item) => item.mode),
            ],
            scope
        );
        const effectiveSnapshotModes =
            snapshotModes.length > 0 ? snapshotModes : defaultQueueModesForScope(scope);

        if (summary.status === "success") {
            const lines = await this.buildQueueSnapshotLines(
                scope,
                effectiveSnapshotModes,
                message.guild
            );
            await message.channel.send(lines.join("\n"));
            return;
        }

        if (summary.status === "partial") {
            const reason = compactText(
                queueResult.failedModes[0]?.error || "Some requested modes could not be added."
            );
            const lines = await this.buildQueueSnapshotLines(
                scope,
                effectiveSnapshotModes,
                message.guild
            );
            await message.channel.send([`Added with issues: ${reason}`, ...lines].join("\n"));
            return;
        }

        if (summary.status === "error") {
            const reason = detailLines[0] || "Join blocked.";
            await message.channel.send(`Join blocked: ${reason.replace(/^\*\*|\*\*$/g, "")}`);
            return;
        }

        const info = detailLines[0] || "No valid mode provided.";
        await message.channel.send(info);
    }
}
