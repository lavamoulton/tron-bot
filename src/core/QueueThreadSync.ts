import { container } from "@sapphire/framework";
import { getRootData } from "@sapphire/pieces";
import { EmbedBuilder, PermissionFlagsBits, type Guild, type GuildEmoji } from "discord.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config, type QueueScope } from "../config/config";
import { getQueueModeState, getQueuePops, QueueModeStateResult, QueuePopResult } from "./rclQueueApi";
import {
    parseDiscordUserIdFromSource,
    resolvePlayerDiscordIdsBySource,
    resolvePlayerDisplayNamesBySource,
} from "./discordDisplayNames";
import { playerDirectoryCache } from "./PlayerDirectoryCache";
import { resolveQueueTier, type QueueTier } from "./queuePresentation";
import { fortTierBalancer, type FortBalanceResult } from "./FortTierBalancer";

type QueueThreadTarget = {
    mode: string;
    threadId: string;
};

type QueuePopTarget = {
    mode: string;
    scope: QueueScope;
    channelId: string;
};

type QueueThreadSyncState = {
    sinceIso: string | null;
    popSinceByScope: Partial<Record<QueueScope, string | null>>;
    statusHashes: Record<string, string>;
    statusMessageIds: Record<string, string>;
    seenPopIds: string[];
};

const STATE_FILENAME = "queue-thread-sync-state.json";
const MAX_SEEN_POP_IDS = 200;
const ALL_QUEUE_SCOPES: QueueScope[] = ["open", "beginner", "pro"];

const POP_MODE_STYLE: Record<string, { label: string; color: number }> = {
    fort: { label: "FORT", color: 0xf59e0b },
    tst: { label: "TST", color: 0x22d3ee },
    sumo: { label: "SUMOBAR", color: 0x60a5fa },
    wst: { label: "WST", color: 0x14b8a6 },
    ctf4v4: { label: "CTF", color: 0xf97316 },
    "4tf": { label: "4TF", color: 0xef4444 },
};

const TST_TEAM_LAYOUT = [
    {
        teamIndex: 1,
        label: "Purple",
        emojiNames: ["cycle8", "purple"],
        guildEmojiId: "1511425569974128753",
    },
    {
        teamIndex: 2,
        label: "Orange",
        emojiNames: ["cycle7", "orange"],
        guildEmojiId: "1511425571987394701",
    },
    {
        teamIndex: 3,
        label: "Cyan",
        emojiNames: ["cycle6", "cyan", "ugly"],
        guildEmojiId: "1511425567293968424",
    },
    {
        teamIndex: 4,
        label: "Gold",
        emojiNames: ["tstgold"],
        guildEmojiId: null,
        uploadName: "tstgold",
        cdnUrl: "https://cdn.discordapp.com/emojis/736663849763209227.webp",
    },
] as const;

const FORT_BLUE_EMOJI_LOOKUP_INDEX = 101;
const FORT_BLUE_CYCLE_EMOJI = {
    emojiNames: ["fortblue", "cycleblue"],
    uploadName: "fortblue",
    cdnUrl: "https://cdn.discordapp.com/emojis/736663848551186432.webp?size=96",
} as const;

const FORT_TEAM_LAYOUT = [
    { teamIndex: 1, label: "Blue", tstTeamEmojiIndex: FORT_BLUE_EMOJI_LOOKUP_INDEX, fallbackEmoji: "🔵" },
    { teamIndex: 2, label: "Gold", tstTeamEmojiIndex: 4, fallbackEmoji: "🟡" },
] as const;

const TST_BRAND_ICON_URL = "https://hub.retrocyclesleague.com/icons/icon-192.png";

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

const TIER_LABEL: Record<QueueTier, string> = {
    bronze: "Bronze",
    silver: "Silver",
    gold: "Gold",
    platinum: "Platinum",
    diamond: "Diamond",
    amethyst: "Amethyst",
    master: "Master",
    grandmaster: "Grandmaster",
    legend: "Legend",
};

type TstTeamCell = {
    teamIndex: number;
    teamEmoji: string;
    label: string;
    players: string[];
};

type FortTeamCell = {
    teamIndex: number;
    label: string;
    teamEmoji: string;
    players: string[];
    captain: string | null;
    mentionUserIds: string[];
    score: number | null;
};

type FortDisplayPlayer = {
    playerName: string;
    discordId: string | null;
};

function parseQueueThreadTargets(raw: string | undefined): QueueThreadTarget[] {
    if (!raw) return [];
    return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((pair) => {
            const [modeRaw, threadIdRaw] = pair.split(":");
            const mode = (modeRaw || "").trim().toLowerCase();
            const threadId = (threadIdRaw || "").trim();
            return { mode, threadId };
        })
        .filter((target) => target.mode.length > 0 && target.threadId.length > 0);
}

function resolveModesForScope(scope: QueueScope): string[] {
    return scope === "open" ? ["fort", "tst", "sumo", "wst", "ctf4v4", "4tf"] : ["tst", "sumo"];
}

function resolveQueuePopTargets(threadTargets: QueueThreadTarget[]): QueuePopTarget[] {
    const fromThreadTargets: QueuePopTarget[] = threadTargets.map((target) => ({
        mode: target.mode,
        scope: "open",
        channelId: target.threadId,
    }));
    const fromLanePolicies: QueuePopTarget[] = (config.QUEUE_CHANNEL_POLICIES || []).flatMap((policy) =>
        resolveModesForScope(policy.scope).map((mode) => ({
            mode,
            scope: policy.scope,
            channelId: policy.channelId,
        }))
    );

    const merged = [...fromThreadTargets, ...fromLanePolicies];
    const deduped = new Map<string, QueuePopTarget>();
    for (const target of merged) {
        const mode = String(target.mode || "").trim().toLowerCase();
        const channelId = String(target.channelId || "").trim();
        if (!mode || !channelId) continue;
        const key = `${target.scope}:${mode}:${channelId}`;
        deduped.set(key, { mode, scope: target.scope, channelId });
    }
    return [...deduped.values()];
}

function toModeLabel(mode: string): string {
    const normalized = String(mode || "").toLowerCase();
    return POP_MODE_STYLE[normalized]?.label || normalized.toUpperCase();
}

function toDiscordTimestamp(iso: string): string {
    const epochSeconds = Math.floor(Date.parse(iso) / 1000);
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return iso;
    return `<t:${epochSeconds}:R>`;
}

function buildStateHash(state: QueueModeStateResult): string {
    return createHash("sha256")
        .update(
            JSON.stringify({
                mode: state.mode.id,
                requiredCount: state.mode.requiredCount,
                currentCount: state.mode.currentCount,
                entries: state.mode.entries.map((entry) => ({
                    playerName: entry.playerName,
                    queuedAt: entry.queuedAt,
                })),
            })
        )
        .digest("hex");
}

function formatModeStateMessage(state: QueueModeStateResult): string {
    const header = `**Queue status - ${toModeLabel(state.mode.id)}**`;
    const counts = `Players: **${state.mode.currentCount}/${state.mode.requiredCount}**`;
    const entryNames =
        state.mode.entries.length > 0
            ? state.mode.entries.map((entry) => `\`${entry.playerName}\``).join(", ")
            : "_none_";
    const updatedAt = `Updated: ${toDiscordTimestamp(new Date().toISOString())}`;
    return `${header}\n${counts}\nEntries: ${entryNames}\n${updatedAt}`;
}

function parsePlayerNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((name) => String(name)).filter(Boolean);
}

function normalizeEmojiName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findBestMatchingEmoji(emojis: GuildEmoji[], terms: readonly string[]): GuildEmoji | null {
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

async function ensureTstTeamEmojis(guild: Guild): Promise<void> {
    const me = await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) return;

    for (const team of TST_TEAM_LAYOUT) {
        if (!("uploadName" in team) || !team.uploadName || !team.cdnUrl) continue;
        if (guild.emojis.cache.some((emoji) => emoji.name === team.uploadName)) continue;
        if (team.emojiNames.some((name) => guild.emojis.cache.some((emoji) => emoji.name === name))) continue;
        try {
            await guild.emojis.create({
                attachment: team.cdnUrl,
                name: team.uploadName,
                reason: "RCL TST team gold color",
            });
        } catch {
            // Slot limit or missing permission.
        }
    }
    if (
        !guild.emojis.cache.some((emoji) => emoji.name === FORT_BLUE_CYCLE_EMOJI.uploadName) &&
        !FORT_BLUE_CYCLE_EMOJI.emojiNames.some((name) => guild.emojis.cache.some((emoji) => emoji.name === name))
    ) {
        try {
            await guild.emojis.create({
                attachment: FORT_BLUE_CYCLE_EMOJI.cdnUrl,
                name: FORT_BLUE_CYCLE_EMOJI.uploadName,
                reason: "RCL Fort blue team color",
            });
        } catch {
            // Slot limit or missing permission.
        }
    }
    await guild.emojis.fetch().catch(() => undefined);
}

function resolveTeamEmojiString(guild: Guild, team: (typeof TST_TEAM_LAYOUT)[number]): string | null {
    for (const name of team.emojiNames) {
        const match = guild.emojis.cache.find((emoji) => emoji.name === name);
        if (match) return match.toString();
    }
    if (team.guildEmojiId) {
        const byId = guild.emojis.cache.get(team.guildEmojiId);
        if (byId) return byId.toString();
    }
    if ("uploadName" in team && team.uploadName) {
        const uploaded = guild.emojis.cache.find((emoji) => emoji.name === team.uploadName);
        if (uploaded) return uploaded.toString();
    }
    return null;
}

function resolveFortBlueEmojiString(guild: Guild): string | null {
    for (const name of FORT_BLUE_CYCLE_EMOJI.emojiNames) {
        const match = guild.emojis.cache.find((emoji) => emoji.name === name);
        if (match) return match.toString();
    }
    return null;
}

async function buildTstTeamEmojiLookup(guild: Guild | null | undefined): Promise<Map<number, string>> {
    const lookup = new Map<number, string>();
    if (!guild) return lookup;
    if (guild.emojis.cache.size === 0) {
        await guild.emojis.fetch().catch(() => undefined);
    }
    await ensureTstTeamEmojis(guild);

    for (const team of TST_TEAM_LAYOUT) {
        const emoji = resolveTeamEmojiString(guild, team);
        if (emoji) lookup.set(team.teamIndex, emoji);
    }
    const fortBlueEmoji = resolveFortBlueEmojiString(guild);
    if (fortBlueEmoji) lookup.set(FORT_BLUE_EMOJI_LOOKUP_INDEX, fortBlueEmoji);
    return lookup;
}

function applyDisplayNames(names: string[], displayNameByPlayerName: Map<string, string>): string[] {
    return names.map((name) => displayNameByPlayerName.get(name) || name);
}


function extractPopPlayerSources(pop: QueuePopResult): Array<{ playerName: string; sourceServer: string | null }> {
    const metadata = pop.allocationMetadata || {};
    const rawSources = Array.isArray((metadata as any).playerSources)
        ? ((metadata as any).playerSources as any[])
        : [];
    return rawSources
        .map((source) => ({
            playerName: String(source?.playerName || "").trim(),
            sourceServer: source?.sourceServer ? String(source.sourceServer) : null,
        }))
        .filter((source) => source.playerName.length > 0);
}

async function buildTierEmojiLookup(
    guild: Guild | null | undefined
): Promise<Partial<Record<QueueTier, string>>> {
    const lookup: Partial<Record<QueueTier, string>> = {};
    if (!guild) return lookup;
    if (guild.emojis.cache.size === 0) {
        await guild.emojis.fetch().catch(() => undefined);
    }
    const emojis = [...guild.emojis.cache.values()];
    if (emojis.length === 0) return lookup;
    for (const tier of Object.keys(TIER_EMOJI_TERMS) as QueueTier[]) {
        const emoji = findBestMatchingEmoji(emojis, TIER_EMOJI_TERMS[tier]);
        if (emoji) lookup[tier] = emoji.toString();
    }
    return lookup;
}

function formatPlayerMention(
    playerName: string,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>
): string {
    const displayName = displayNameByPlayerName.get(playerName) || playerName;
    const userId = discordIdByPlayerName.get(playerName);
    if (userId) {
        return `<@${userId}>`;
    }
    return `@ ${displayName}`;
}

function resolvePlayerRankEmoji(
    playerName: string,
    sourceByPlayerName: Map<string, string | null>,
    fallbackRatingByPlayerName: Map<string, number>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>
): string {
    const sourceServer = sourceByPlayerName.get(playerName);
    const discordUserId = parseDiscordUserIdFromSource(sourceServer);
    const directoryEntry =
        (discordUserId ? playerDirectoryCache.getByDiscordUserId(discordUserId) : null) ||
        playerDirectoryCache.getByPlayerName(playerName);
    const ratingElo = directoryEntry?.ratingElo ?? fallbackRatingByPlayerName.get(playerName) ?? null;
    const tier = resolveQueueTier(ratingElo);
    return tier ? tierEmojiLookup[tier] || "" : "";
}

function formatTstPlayerLine(
    playerName: string,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>,
    sourceByPlayerName: Map<string, string | null>,
    fallbackRatingByPlayerName: Map<string, number>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>
): string {
    const mention = formatPlayerMention(playerName, displayNameByPlayerName, discordIdByPlayerName);
    const rankEmoji = resolvePlayerRankEmoji(
        playerName,
        sourceByPlayerName,
        fallbackRatingByPlayerName,
        tierEmojiLookup
    );
    return rankEmoji ? `${mention} ${rankEmoji}` : mention;
}

function formatFortPlayerLine(
    player: FortDisplayPlayer,
    displayNameByPlayerName: Map<string, string>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>
): string {
    const fallbackName = displayNameByPlayerName.get(player.playerName) || player.playerName;
    const directoryEntry =
        (player.discordId ? playerDirectoryCache.getByDiscordUserId(player.discordId) : null) ||
        playerDirectoryCache.getByPlayerName(player.playerName);
    const tier = resolveQueueTier(directoryEntry?.ratingElo ?? null);
    const rankEmoji = tier ? tierEmojiLookup[tier] || "" : "";
    const display = player.discordId
        ? fortTierBalancer.getNickname(player.discordId) || fallbackName
        : fallbackName;
    return rankEmoji ? `${display} ${rankEmoji}` : display;
}

function buildTstTeamCells(
    pop: QueuePopResult,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>,
    teamEmojiByIndex: Map<number, string>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>
): TstTeamCell[] {
    const metadata = pop.allocationMetadata || {};
    const rawTeams = Array.isArray((metadata as any).tstTeams) ? ((metadata as any).tstTeams as any[]) : [];
    const indexedTeams = new Map<number, string[]>();
    const indexedRatings = new Map<number, number[]>();
    const sourceByPlayerName = new Map(
        extractPopPlayerSources(pop).map((source) => [source.playerName, source.sourceServer] as const)
    );

    for (const team of rawTeams) {
        const teamIndex = Number(team?.teamIndex || 0);
        if (!Number.isFinite(teamIndex) || teamIndex <= 0) continue;
        indexedTeams.set(teamIndex, parsePlayerNames(team?.playerNames));
        const ratings = Array.isArray(team?.ratings)
            ? team.ratings
                  .map((rating: unknown) => Number(rating))
                  .filter((rating: number) => Number.isFinite(rating))
            : [];
        indexedRatings.set(teamIndex, ratings);
    }

    if (indexedTeams.size === 0) {
        for (let i = 0; i < TST_TEAM_LAYOUT.length; i += 1) {
            const slice = pop.playerNames.slice(i * 2, i * 2 + 2);
            indexedTeams.set(i + 1, slice);
        }
    }

    const fallbackRatingByPlayerName = new Map<string, number>();
    for (const [teamIndex, teamNames] of indexedTeams.entries()) {
        const ratings = indexedRatings.get(teamIndex) || [];
        teamNames.forEach((playerName, index) => {
            const rating = ratings[index];
            if (Number.isFinite(rating)) fallbackRatingByPlayerName.set(playerName, rating);
        });
    }

    const lines = TST_TEAM_LAYOUT.map((team) => {
        const teamNames = indexedTeams.get(team.teamIndex) || [];
        const players = teamNames.length
            ? teamNames
                  .map((name) =>
                      formatTstPlayerLine(
                          name,
                          displayNameByPlayerName,
                          discordIdByPlayerName,
                          sourceByPlayerName,
                          fallbackRatingByPlayerName,
                          tierEmojiLookup
                      )
                  )
            : ["empty"];
        const teamEmoji = teamEmojiByIndex.get(team.teamIndex) || "";
        return {
            teamIndex: team.teamIndex,
            teamEmoji,
            label: team.label,
            players,
        };
    });

    return lines;
}

function buildTstPlainText(cells: TstTeamCell[]): string {
    return [
        "----- TST ready to start! -----",
        ...cells.map((cell) => {
            const icon = cell.teamEmoji || `#${cell.teamIndex}`;
            return `${icon} ${cell.label}: ${cell.players.join(", ")}`;
        }),
    ].join("\n");
}

function buildFortTeamCells(
    pop: QueuePopResult,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>,
    teamEmojiByIndex: Map<number, string>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>,
    fortBalance: FortBalanceResult | null
): FortTeamCell[] {
    const metadata = pop.allocationMetadata || {};
    const rawTeams = Array.isArray((metadata as any).fortTeams) ? ((metadata as any).fortTeams as any[]) : [];
    const indexedTeams = new Map<number, FortDisplayPlayer[]>();
    const indexedCaptains = new Map<number, FortDisplayPlayer | null>();
    const indexedScores = new Map<number, number | null>();

    if (fortBalance) {
        for (const team of fortBalance.teams) {
            indexedTeams.set(
                team.teamIndex,
                team.playerIds.map((discordId, index) => ({
                    playerName: team.playerNames[index] || discordId,
                    discordId,
                }))
            );
            indexedCaptains.set(
                team.teamIndex,
                team.captainDiscordId
                    ? {
                          playerName: team.captainPlayerName || team.captainDiscordId,
                          discordId: team.captainDiscordId,
                      }
                    : null
            );
            indexedScores.set(team.teamIndex, team.score);
        }
    } else {
        for (const team of rawTeams) {
            const teamIndex = Number(team?.teamIndex || 0);
            if (!Number.isFinite(teamIndex) || teamIndex <= 0) continue;
            indexedTeams.set(
                teamIndex,
                parsePlayerNames(team?.playerNames).map((playerName) => ({
                    playerName,
                    discordId: discordIdByPlayerName.get(playerName) || null,
                }))
            );
        }
    }

    if (indexedTeams.size === 0) {
        const splitAt = Math.ceil(pop.playerNames.length / 2);
        indexedTeams.set(
            1,
            pop.playerNames.slice(0, splitAt).map((playerName) => ({
                playerName,
                discordId: discordIdByPlayerName.get(playerName) || null,
            }))
        );
        indexedTeams.set(
            2,
            pop.playerNames.slice(splitAt).map((playerName) => ({
                playerName,
                discordId: discordIdByPlayerName.get(playerName) || null,
            }))
        );
    }

    return FORT_TEAM_LAYOUT.map((team) => {
        const teamPlayers = indexedTeams.get(team.teamIndex) || [];
        const players = teamPlayers.length
            ? teamPlayers.map((player) => formatFortPlayerLine(player, displayNameByPlayerName, tierEmojiLookup))
            : ["empty"];
        const mentionUserIds = Array.from(
            new Set(
                teamPlayers
                    .map((player) => player.discordId)
                    .filter((discordId): discordId is string => Boolean(discordId))
            )
        );
        const captainPlayer = indexedCaptains.get(team.teamIndex) || null;
        const captain = captainPlayer
            ? formatFortPlayerLine(captainPlayer, displayNameByPlayerName, tierEmojiLookup)
            : null;
        const teamEmoji = teamEmojiByIndex.get(team.tstTeamEmojiIndex) || team.fallbackEmoji;
        return {
            teamIndex: team.teamIndex,
            label: team.label,
            teamEmoji,
            players,
            captain,
            mentionUserIds,
            score: indexedScores.get(team.teamIndex) ?? null,
        };
    });
}

function buildFortPlainText(
    cells: FortTeamCell[],
    fortBalance: FortBalanceResult | null,
    includeDiagnostics = false
): string {
    const lines = [
        "----- Fortress ready to start! -----",
        ...cells.map((cell) => {
            const icon = cell.teamEmoji || `#${cell.teamIndex}`;
            return `${icon} ${cell.label}: ${cell.players.join(", ")}`;
        }),
    ];
    const captains = cells
        .map((cell) => cell.captain)
        .filter((captain): captain is string => Boolean(captain));
    if (captains.length > 0) {
        lines.push(`Captains: ${captains.join(", ")}`);
    }
    if (fortBalance && includeDiagnostics) {
        lines.push(...buildFortDiagnostics(fortBalance));
    }
    if (fortBalance && !fortBalance.thresholdMet) {
        lines.push("⚠️ Balancing threshold not met. I tried my best.");
    }
    const pingUserIds = Array.from(new Set(cells.flatMap((cell) => cell.mentionUserIds)));
    if (pingUserIds.length > 0) {
        lines.push(`Pings: ${pingUserIds.map((userId) => `<@${userId}>`).join(" ")}`);
    }
    return lines.join("\n");
}

function buildFortPopTextPayload(
    pop: QueuePopResult,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>,
    teamEmojiByIndex: Map<number, string>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>,
    fortBalance: FortBalanceResult | null,
    includeDiagnostics = false
): { content: string; allowedMentions?: { users: string[] } } {
    const cells = buildFortTeamCells(
        pop,
        displayNameByPlayerName,
        discordIdByPlayerName,
        teamEmojiByIndex,
        tierEmojiLookup,
        fortBalance
    );
    const userIds = Array.from(new Set(cells.flatMap((cell) => cell.mentionUserIds)));
    return {
        content: buildFortPlainText(cells, fortBalance, includeDiagnostics),
        ...(userIds.length > 0 ? { allowedMentions: { users: userIds } } : {}),
    };
}

function buildSumobarPopEmbed(
    pop: QueuePopResult,
    displayNameByPlayerName: Map<string, string>
): EmbedBuilder {
    const players = pop.playerNames.length > 0
        ? applyDisplayNames(pop.playerNames, displayNameByPlayerName)
        : ["empty"];
    const splitAt = Math.ceil(players.length / 2);
    const leftColumn = players.slice(0, splitAt);
    const rightColumn = players.slice(splitAt);

    return new EmbedBuilder()
        .setColor(POP_MODE_STYLE.sumo.color)
        .setAuthor({
            name: "▦ SUMOBAR READY ▦",
            iconURL: TST_BRAND_ICON_URL,
        })
        .addFields(
            {
                name: "Players",
                value: leftColumn.join("\n") || "empty",
                inline: true,
            },
            {
                name: "\u200B",
                value: rightColumn.join("\n") || "\u200B",
                inline: true,
            }
        )
        .setTimestamp(new Date(pop.poppedAt));
}

function buildTstPopTextPayload(
    pop: QueuePopResult,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>,
    teamEmojiByIndex: Map<number, string>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>
): { content: string; allowedMentions?: { users: string[] } } {
    const cells = buildTstTeamCells(
        pop,
        displayNameByPlayerName,
        discordIdByPlayerName,
        teamEmojiByIndex,
        tierEmojiLookup
    );
    const userIds = Array.from(
        new Set(
            pop.playerNames
                .map((playerName) => discordIdByPlayerName.get(playerName))
                .filter((userId): userId is string => Boolean(userId))
        )
    );
    return {
        content: buildTstPlainText(cells),
        ...(userIds.length > 0 ? { allowedMentions: { users: userIds } } : {}),
    };
}

export type PopSendPayload =
    | string
    | { content?: string; embeds?: EmbedBuilder[]; allowedMentions?: { users: string[] } };

export type QueuePopSendPayloadOptions = {
    includeFortDiagnostics?: boolean;
};

function formatFortPercent(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : "n/a";
}

function buildFortDiagnostics(fortBalance: FortBalanceResult): string[] {
    return [
        `Balance level: ${formatFortPercent(fortBalance.balanceConfidence)} | Match quality: ${formatFortPercent(fortBalance.matchQuality)}`,
    ];
}

function buildPopSendPayload(
    pop: QueuePopResult,
    displayNameByPlayerName: Map<string, string>,
    discordIdByPlayerName: Map<string, string>,
    teamEmojiByIndex: Map<number, string>,
    tierEmojiLookup: Partial<Record<QueueTier, string>>,
    fortBalance: FortBalanceResult | null = null,
    options: QueuePopSendPayloadOptions = {}
): PopSendPayload {
    if (String(pop.mode || "").toLowerCase() === "tst") {
        return buildTstPopTextPayload(
            pop,
            displayNameByPlayerName,
            discordIdByPlayerName,
            teamEmojiByIndex,
            tierEmojiLookup
        );
    }

    if (String(pop.mode || "").toLowerCase() === "fort") {
        return buildFortPopTextPayload(
            pop,
            displayNameByPlayerName,
            discordIdByPlayerName,
            teamEmojiByIndex,
            tierEmojiLookup,
            fortBalance,
            options.includeFortDiagnostics || Boolean((pop.allocationMetadata as any)?.random)
        );
    }

    if (["sumo", "sumobar"].includes(String(pop.mode || "").toLowerCase())) {
        return {
            embeds: [
                buildSumobarPopEmbed(
                    pop,
                    displayNameByPlayerName
                ),
            ],
        };
    }

    const modeLabel = toModeLabel(pop.mode);
    const poppedAtLabel = toDiscordTimestamp(pop.poppedAt);
    const header = `**${modeLabel} Match Ready** • ${poppedAtLabel}`;
    const players =
        pop.playerNames.length > 0
            ? applyDisplayNames(pop.playerNames, displayNameByPlayerName).join(", ")
            : "empty";
    return `${header}\n${players}`;
}

export async function buildQueuePopSendPayloadForGuild(
    pop: QueuePopResult,
    guild: Guild | null | undefined,
    options: QueuePopSendPayloadOptions = {}
): Promise<PopSendPayload> {
    const playerSources = extractPopPlayerSources(pop);
    const displayNameByPlayerName = await resolvePlayerDisplayNamesBySource(
        guild,
        container.client,
        playerSources
    );
    const discordIdByPlayerName = resolvePlayerDiscordIdsBySource(playerSources);
    const teamEmojiByIndex = await buildTstTeamEmojiLookup(guild);
    const tierEmojiLookup = await buildTierEmojiLookup(guild);
    await playerDirectoryCache.ensureFresh();
    const fortBalance =
        String(pop.mode || "").toLowerCase() === "fort"
            ? await fortTierBalancer.balance(
                  playerSources.map((source) => ({
                      playerName: source.playerName,
                      discordId: parseDiscordUserIdFromSource(source.sourceServer) || source.playerName,
                  }))
              )
            : null;
    return buildPopSendPayload(
        pop,
        displayNameByPlayerName,
        discordIdByPlayerName,
        teamEmojiByIndex,
        tierEmojiLookup,
        fortBalance,
        options
    );
}

export class QueueThreadSync {
    private readonly pollMs = Math.max(1000, config.QUEUE_THREAD_POLL_MS || 3000);
    private readonly popLimit = Math.max(1, Math.min(config.QUEUE_THREAD_POP_LIMIT || 20, 50));
    private readonly targets = parseQueueThreadTargets(config.QUEUE_THREAD_IDS);
    private readonly popTargets = resolveQueuePopTargets(this.targets);
    private readonly popScopes = Array.from(
        new Set(this.popTargets.map((target) => target.scope))
    ) as QueueScope[];
    private readonly statePath = join(getRootData().root, config.DATA_PATH, STATE_FILENAME);
    private state: QueueThreadSyncState = {
        sinceIso: null,
        popSinceByScope: {},
        statusHashes: {},
        statusMessageIds: {},
        seenPopIds: [],
    };
    private started = false;
    private tickActive = false;

    public async start(): Promise<void> {
        if (this.started) return;

        if (!config.RCL_API_URL || !config.RCL_API_KEY) {
            container.logger.info("Queue thread sync disabled (missing RCL_API_URL/RCL_API_KEY)");
            return;
        }
        if (this.targets.length === 0 && this.popTargets.length === 0) {
            container.logger.info(
                "Queue thread sync disabled (no QUEUE_THREAD_IDS and no QUEUE_CHANNEL_POLICIES targets)"
            );
            return;
        }

        this.state = await this.loadState();
        let stateUpdated = false;
        const nowIso = new Date().toISOString();
        if (!this.state.sinceIso) {
            // Keep legacy cursor to support prior state format.
            this.state.sinceIso = nowIso;
            stateUpdated = true;
        }
        for (const scope of this.popScopes) {
            if (!this.state.popSinceByScope[scope]) {
                // Initialize per-scope cursors to now so startup does not replay old pops.
                this.state.popSinceByScope[scope] = nowIso;
                stateUpdated = true;
            }
        }
        if (stateUpdated) {
            await this.saveState();
        }

        this.started = true;
        if (this.targets.length > 0) {
            container.logger.info(
                `Queue thread status sync enabled for modes: ${this.targets
                    .map((target) => target.mode)
                    .join(", ")}`
            );
        }
        if (this.popTargets.length > 0) {
            container.logger.info(
                `Queue pop sync enabled for ${this.popTargets.length} target(s): ${this.popTargets
                    .map((target) => `${target.scope}:${target.mode}->${target.channelId}`)
                    .join(", ")}`
            );
        }
        await this.tick();
        setInterval(() => {
            void this.tick();
        }, this.pollMs);
    }

    private async tick(): Promise<void> {
        if (this.tickActive) return;
        this.tickActive = true;

        try {
            let updated = false;
            updated = (await this.syncModeStateMessages()) || updated;
            updated = (await this.syncPopMessages()) || updated;
            if (updated) {
                await this.saveState();
            }
        } catch (error) {
            container.logger.error(`Queue thread sync tick failed: ${error}`);
        } finally {
            this.tickActive = false;
        }
    }

    private async syncModeStateMessages(): Promise<boolean> {
        let updated = false;
        for (const target of this.targets) {
            try {
                const state = await getQueueModeState(target.mode, "open");
                const nextHash = buildStateHash(state);
                if (this.state.statusHashes[target.mode] === nextHash) continue;

                const message = await this.ensureStatusMessage(target.threadId, target.mode, formatModeStateMessage(state));
                this.state.statusHashes[target.mode] = nextHash;
                this.state.statusMessageIds[target.mode] = message.id;
                updated = true;
            } catch (error) {
                container.logger.warn(
                    `Queue state sync failed for mode ${target.mode} thread ${target.threadId}: ${error}`
                );
            }
        }
        return updated;
    }

    private async syncPopMessages(): Promise<boolean> {
        if (this.popTargets.length === 0 || this.popScopes.length === 0) return false;

        const knownIds = new Set(this.state.seenPopIds);
        let updated = false;
        let globalNextSinceMs = this.state.sinceIso ? Date.parse(this.state.sinceIso) : NaN;

        for (const scope of this.popScopes) {
            const sinceForScope = this.state.popSinceByScope[scope] || this.state.sinceIso || undefined;
            const pops = await getQueuePops({
                since: sinceForScope || undefined,
                limit: this.popLimit,
                scope,
            });
            if (pops.length === 0) continue;

            const targetsByMode = new Map<string, string[]>();
            for (const target of this.popTargets) {
                if (target.scope !== scope) continue;
                const mode = target.mode.toLowerCase();
                const existing = targetsByMode.get(mode) || [];
                if (!existing.includes(target.channelId)) existing.push(target.channelId);
                targetsByMode.set(mode, existing);
            }

            let nextScopeSinceMs = sinceForScope ? Date.parse(sinceForScope) : NaN;
            const orderedPops = [...pops].sort((a, b) => Date.parse(a.poppedAt) - Date.parse(b.poppedAt));
            for (const pop of orderedPops) {
                const poppedAtMs = Date.parse(pop.poppedAt);
                if (
                    Number.isFinite(poppedAtMs) &&
                    (!Number.isFinite(nextScopeSinceMs) || poppedAtMs > nextScopeSinceMs)
                ) {
                    nextScopeSinceMs = poppedAtMs;
                }
                if (
                    Number.isFinite(poppedAtMs) &&
                    (!Number.isFinite(globalNextSinceMs) || poppedAtMs > globalNextSinceMs)
                ) {
                    globalNextSinceMs = poppedAtMs;
                }

                if (knownIds.has(pop.id)) continue;
                const targetChannelIds = targetsByMode.get(pop.mode.toLowerCase()) || [];
                if (targetChannelIds.length === 0) {
                    knownIds.add(pop.id);
                    continue;
                }

                let delivered = false;
                for (const channelId of targetChannelIds) {
                    try {
                        const channel = await this.fetchTextChannel(channelId);
                        const guild =
                            channel && "guild" in channel ? ((channel as any).guild as any) : null;
                        const payload = await buildQueuePopSendPayloadForGuild(pop, guild);
                        await channel.send(typeof payload === "string" ? payload : payload);
                        container.logger.info(
                            `Posted queue pop ${pop.id} (${scope}/${pop.mode}) to channel ${channelId}`
                        );
                        delivered = true;
                    } catch (error) {
                        container.logger.warn(
                            `Failed posting queue pop ${pop.id} to channel ${channelId}: ${error}`
                        );
                    }
                }

                if (delivered) {
                    knownIds.add(pop.id);
                    updated = true;
                }
            }

            if (Number.isFinite(nextScopeSinceMs)) {
                const nextScopeIso = new Date(nextScopeSinceMs).toISOString();
                if (this.state.popSinceByScope[scope] !== nextScopeIso) {
                    this.state.popSinceByScope[scope] = nextScopeIso;
                    updated = true;
                }
            }
        }

        if (Number.isFinite(globalNextSinceMs)) {
            const nextGlobalIso = new Date(globalNextSinceMs).toISOString();
            if (this.state.sinceIso !== nextGlobalIso) {
                this.state.sinceIso = nextGlobalIso;
                updated = true;
            }
        }

        this.state.seenPopIds = Array.from(knownIds).slice(-MAX_SEEN_POP_IDS);
        return updated;
    }

    private async ensureStatusMessage(threadId: string, mode: string, content: string): Promise<{ id: string }> {
        const channel = await this.fetchTextChannel(threadId);
        const existingMessageId = this.state.statusMessageIds[mode];
        if (existingMessageId) {
            try {
                const existing = await channel.messages.fetch(existingMessageId);
                await existing.edit(content);
                return { id: existing.id };
            } catch {
                // Message may have been deleted; fall through to create a replacement.
            }
        }
        const created = await channel.send(content);
        return { id: created.id };
    }

    private async fetchTextChannel(threadId: string): Promise<any> {
        const channel = await container.client.channels.fetch(threadId);
        if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
            throw new Error(`Channel ${threadId} is not text-based or was not found`);
        }
        if (!("send" in channel) || !("messages" in channel)) {
            throw new Error(`Channel ${threadId} does not support messaging`);
        }
        return channel;
    }

    private async loadState(): Promise<QueueThreadSyncState> {
        try {
            const raw = await readFile(this.statePath, "utf8");
            const parsed = JSON.parse(raw) as Partial<QueueThreadSyncState>;
            const popSinceByScope: Partial<Record<QueueScope, string | null>> = {};
            for (const scope of ALL_QUEUE_SCOPES) {
                const value = parsed.popSinceByScope?.[scope];
                popSinceByScope[scope] = typeof value === "string" ? value : null;
            }
            return {
                sinceIso: typeof parsed.sinceIso === "string" ? parsed.sinceIso : null,
                popSinceByScope,
                statusHashes: parsed.statusHashes || {},
                statusMessageIds: parsed.statusMessageIds || {},
                seenPopIds: Array.isArray(parsed.seenPopIds)
                    ? parsed.seenPopIds.map((id) => String(id)).slice(-MAX_SEEN_POP_IDS)
                    : [],
            };
        } catch {
            return {
                sinceIso: null,
                popSinceByScope: {},
                statusHashes: {},
                statusMessageIds: {},
                seenPopIds: [],
            };
        }
    }

    private async saveState(): Promise<void> {
        const folder = join(getRootData().root, config.DATA_PATH);
        await mkdir(folder, { recursive: true });
        await writeFile(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
    }
}
