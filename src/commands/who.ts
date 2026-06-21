import { Command, container } from "@sapphire/framework";
import type { Guild, GuildEmoji, Message } from "discord.js";
import { config, type QueueScope } from "../config/config";
import {
    getQueueModeState,
    normalizeQueueScope,
    type QueueModeStateEntry,
    type QueueModeStateResult,
} from "../core/rclQueueApi";
import {
    isQueueModeAllowedInScope,
    resolveQueueTier,
    sortQueueModes,
    type QueueTier,
    type QueueCanonicalMode,
} from "../core/queuePresentation";
import { resolvePlayerDisplayNamesBySource } from "../core/discordDisplayNames";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "who";
const COMMAND_DESCRIPTION = "Show the current queue overview";
const DETAILED_DESCRIPTION =
    "Displays who is queued for each available pickup mode in this lane.";

const ALL_QUEUE_MODES: QueueCanonicalMode[] = ["fort", "tst", "sumo", "wst", "ctf4v4", "4tf"];

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

type QueueModeSnapshot =
    | {
          mode: QueueCanonicalMode;
          state: QueueModeStateResult;
      }
    | {
          mode: QueueCanonicalMode;
          error: unknown;
      };

function formatScopeLabel(scope: QueueScope): string {
    return scope.toUpperCase();
}

function normalizeEmojiName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export class WhoCommand extends Command {
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

    private resolveModesForScope(scope: QueueScope): QueueCanonicalMode[] {
        return sortQueueModes(ALL_QUEUE_MODES.filter((mode) => isQueueModeAllowedInScope(mode, scope)));
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
        displayNameByPlayerName: Map<string, string>,
        tierEmojiLookup: Partial<Record<QueueTier, string>>
    ): string {
        if (entries.length === 0) return "empty";
        return entries.map((entry) => {
            const tier = resolveQueueTier(entry.ratingElo);
            const marker = tier ? tierEmojiLookup[tier] || "" : "";
            const displayName = displayNameByPlayerName.get(entry.playerName) || entry.playerName;
            const prefix = marker ? `${marker} ` : "";
            return `${prefix}${displayName}`;
        }).join(", ");
    }

    private async buildQueueOverview(message: Message, scope: QueueScope): Promise<string> {
        const modes = this.resolveModesForScope(scope);
        const snapshots = await Promise.all(
            modes.map(async (mode): Promise<QueueModeSnapshot> => {
                try {
                    return { mode, state: await getQueueModeState(mode, scope) };
                } catch (error) {
                    return { mode, error };
                }
            })
        );

        const playerSources = snapshots.flatMap((snapshot) =>
            "state" in snapshot
                ? snapshot.state.mode.entries.map((entry) => ({
                      playerName: entry.playerName,
                      sourceServer: entry.sourceServer || null,
                  }))
                : []
        );
        const displayNameByPlayerName = await resolvePlayerDisplayNamesBySource(
            message.guild,
            this.container.client,
            playerSources
        );
        const tierEmojiLookup = await this.buildTierEmojiLookup(message.guild);
        const lines = snapshots.map((snapshot) => {
            if (!("state" in snapshot)) {
                container.logger.warn(
                    `Failed reading queue state for ${snapshot.mode}/${scope}: ${snapshot.error}`
                );
                return `${MODE_LINE_LABELS[snapshot.mode]}: unavailable`;
            }
            const current = snapshot.state.mode.currentCount;
            const required = snapshot.state.mode.requiredCount;
            return `${MODE_LINE_LABELS[snapshot.mode]} (${current} / ${required}): ${this.formatRoster(
                snapshot.state.mode.entries,
                displayNameByPlayerName,
                tierEmojiLookup
            )}`;
        });

        return lines.join("\n");
    }

    public async messageRun(message: Message) {
        const { author } = message;
        const content = message.content;
        const scope = this.resolveScopeForChannel(message.channel.id);
        const result = await this.buildQueueOverview(message, scope);

        container.logger.debug(
            `New !who message from ${author.username}: ${content} | scope=${formatScopeLabel(scope)}`
        );
        await message.channel.send(result);
    }
}
