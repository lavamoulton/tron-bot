import { Command, container } from "@sapphire/framework";
import type { Guild, GuildEmoji, Message } from "discord.js";
import {
    getQueueModeState,
    normalizeQueueScope,
    pushDiscordRemoveFromQueueApi,
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
const COMMAND_NAME = "remove";
const COMMAND_DESCRIPTION = "Leave pickup queue mode(s)";
const DETAILED_DESCRIPTION =
    "Use !remove <mode> to leave a specific queue mode, or !remove to leave all modes in this lane.";

type RemoveSyncResult = Awaited<ReturnType<typeof pushDiscordRemoveFromQueueApi>>;

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

function summarizeRemoveResult(result: RemoveSyncResult): {
    title: string;
    status: "success" | "partial" | "error" | "info";
    detailLines: string[];
} {
    if (result.attempted === 0) {
        return {
            title: "No valid mode provided",
            status: "info",
            detailLines: ["Use `!remove` or `!remove <mode>`."],
        };
    }

    if (result.failedModes.length === 0) {
        return {
            title: "Queue updated",
            status: "success",
            detailLines: [`Removed: ${formatModeTokenList(result.successfulModes)}`],
        };
    }

    if (result.successfulModes.length === 0) {
        const firstReason = compactText(result.failedModes[0]?.error || "Queue leave failed.");
        return {
            title: "Leave blocked",
            status: "error",
            detailLines: [`**Couldn't leave queue: ${firstReason}**`],
        };
    }

    return {
        title: "Partially updated",
        status: "partial",
        detailLines: [
            `Removed: ${formatModeTokenList(result.successfulModes)}`,
            ...result.failedModes.map((item) => `• **${item.mode}**: ${compactText(item.error)}`),
        ],
    };
}

export class RemoveCommand extends Command {
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

    private normalizeModesForSnapshot(rawModes: string[], scope: QueueScope): QueueCanonicalMode[] {
        const modes = rawModes
            .map((playlist) => normalizeQueueModeInput(playlist))
            .filter((mode): mode is QueueCanonicalMode => Boolean(mode))
            .filter((mode) => isQueueModeAllowedInScope(mode, scope));
        return sortQueueModes(Array.from(new Set(modes)));
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
        const requestedPlaylists = splitContent.map((token) => token.toLowerCase());

        const queueResult = await pushDiscordRemoveFromQueueApi(
            requestedPlaylists,
            author.id,
            author.username,
            { removeAllWhenEmpty: true, scope }
        );

        const summary = summarizeRemoveResult(queueResult);
        const detailLines = [...summary.detailLines];
        if (queueResult.skippedPlaylists.length > 0) {
            detailLines.push(`Ignored unsupported modes: ${queueResult.skippedPlaylists.join(", ")}`);
        }

        container.logger.debug(
            `New !remove message from ${author.username}: ${content} | (Result): ${summary.title}`
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
                queueResult.failedModes[0]?.error || "Some requested modes could not be removed."
            );
            const lines = await this.buildQueueSnapshotLines(
                scope,
                effectiveSnapshotModes,
                message.guild
            );
            await message.channel.send([`Removed with issues: ${reason}`, ...lines].join("\n"));
            return;
        }

        if (summary.status === "error") {
            const reason = detailLines[0] || "Leave blocked.";
            await message.channel.send(`Leave blocked: ${reason.replace(/^\*\*|\*\*$/g, "")}`);
            return;
        }

        const info = detailLines[0] || "No valid mode provided.";
        await message.channel.send(info);
    }
}
