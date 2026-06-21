import type { QueueScope } from "../config/config";
import type { Guild } from "discord.js";
import type { QueueModeStateEntry } from "./rclQueueApi";

export type QueueTier =
    | "bronze"
    | "silver"
    | "gold"
    | "platinum"
    | "diamond"
    | "amethyst"
    | "master"
    | "grandmaster"
    | "legend";

type QueueTierMeta = {
    label: string;
    iconUrl: string;
};

type QueueScopeTheme = {
    label: string;
    color: number;
};

export type QueueCanonicalMode =
    | "fort"
    | "tst"
    | "sumo"
    | "wst"
    | "ctf4v4"
    | "4tf"
    | "spare1"
    | "spare2";

type QueueModeMeta = {
    short: string;
    title: string;
    aliases: string[];
};

export const QUEUE_SCOPE_THEME: Record<QueueScope, QueueScopeTheme> = {
    open: { label: "OPEN", color: 0x60a5fa },
    beginner: { label: "BEGINNER", color: 0x34d399 },
    pro: { label: "PRO", color: 0xa855f7 },
};

const QUEUE_MODE_META: Record<QueueCanonicalMode, QueueModeMeta> = {
    fort: {
        short: "FORT",
        title: "FORT • 6v6 Fortress",
        aliases: ["fort", "fortress"],
    },
    tst: {
        short: "TST",
        title: "TST • 2v2v2v2 Team Sumo",
        aliases: ["tst", "tstplacement"],
    },
    sumo: {
        short: "SUMOBAR",
        title: "SUMOBAR • Solo 8P Sumo",
        aliases: ["sumo", "sumobar", "sbt"],
    },
    wst: {
        short: "WST",
        title: "WST • 3v3 Sumo",
        aliases: ["wst", "wst3v3", "3v3sumo"],
    },
    ctf4v4: {
        short: "CTF",
        title: "CTF • 4v4 Capture-the-Flag",
        aliases: ["ctf", "ctf4v4", "ctf4", "capturetheflag", "capturetheflag4v4"],
    },
    "4tf": {
        short: "4TF",
        title: "4TF • 4v4v4v4 Fortress",
        aliases: ["4tf", "4wayfort", "4teamfort", "4v4v4v4", "4v4v4v4fort"],
    },
    spare1: {
        short: "TESTING",
        title: "TESTING • Hidden Utility Queue",
        aliases: ["spare1", "test1", "dev1", "utility1"],
    },
    spare2: {
        short: "UTILITY",
        title: "UTILITY • Hidden Utility Queue",
        aliases: ["spare2", "test2", "dev2", "utility2"],
    },
};

const QUEUE_MODE_PRIORITY: QueueCanonicalMode[] = [
    "fort",
    "tst",
    "sumo",
    "wst",
    "ctf4v4",
    "4tf",
    "spare1",
    "spare2",
];
const OPEN_ONLY_MODES = new Set<QueueCanonicalMode>(["fort", "wst", "ctf4v4", "4tf"]);

const MODE_ALIAS_LOOKUP = new Map<string, QueueCanonicalMode>(
    Object.entries(QUEUE_MODE_META).flatMap(([mode, meta]) =>
        meta.aliases.map((alias) => [alias, mode as QueueCanonicalMode] as const)
    )
);

const RCL_HUB_PLAYER_BASE = "https://hub.retrocyclesleague.com/player";

const TIER_META: Record<QueueTier, QueueTierMeta> = {
    bronze: {
        label: "Bronze",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/bronze.svg",
    },
    silver: {
        label: "Silver",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/silver.svg",
    },
    gold: {
        label: "Gold",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/gold.svg",
    },
    platinum: {
        label: "Platinum",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/platinum.svg",
    },
    diamond: {
        label: "Diamond",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/diamond-master-7.svg",
    },
    amethyst: {
        label: "Amethyst",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/diamond-amethyst-9.svg",
    },
    master: {
        label: "Master",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/master.svg",
    },
    grandmaster: {
        label: "Grandmaster",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/grandmaster.svg",
    },
    legend: {
        label: "Legend",
        iconUrl: "https://hub.retrocyclesleague.com/assets/ranks/legend.svg",
    },
};

const TIER_EMOJI_ALIAS: Record<QueueTier, string> = {
    bronze: "bronze",
    silver: "silver",
    gold: "gold",
    platinum: "platinum",
    diamond: "diamond",
    amethyst: "diamond",
    master: "master",
    grandmaster: "grandmaster",
    legend: "legend",
};

export function compactText(value: string, max = 260): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

export function normalizeQueueModeInput(value: string): QueueCanonicalMode | undefined {
    const normalized = String(value || "").trim().toLowerCase();
    return MODE_ALIAS_LOOKUP.get(normalized);
}

export function isQueueModeAllowedInScope(mode: QueueCanonicalMode, scope: QueueScope): boolean {
    return scope === "open" || !OPEN_ONLY_MODES.has(mode);
}

export function defaultQueueModesForScope(scope: QueueScope): QueueCanonicalMode[] {
    return scope === "open" ? ["fort", "tst"] : ["tst"];
}

export function sortQueueModes(modes: QueueCanonicalMode[]): QueueCanonicalMode[] {
    const set = new Set(modes);
    return QUEUE_MODE_PRIORITY.filter((mode) => set.has(mode));
}

export function queueModeCardTitle(mode: QueueCanonicalMode): string {
    return QUEUE_MODE_META[mode].title;
}

export function queueModeShortLabel(mode: QueueCanonicalMode): string {
    return QUEUE_MODE_META[mode].short;
}

// Keep thresholds aligned with RCL Hub leaderboard API.
export function resolveQueueTier(elo: number | null): QueueTier | null {
    if (elo == null || !Number.isFinite(elo)) return null;
    if (elo < 1400) return "bronze";
    if (elo < 1600) return "silver";
    if (elo < 1900) return "gold";
    if (elo < 2100) return "platinum";
    if (elo < 2200) return "diamond";
    if (elo < 2300) return "master";
    if (elo < 2400) return "grandmaster";
    return "legend";
}

function resolveTierBadge(tier: QueueTier, guild: Guild | null | undefined): string {
    const desiredEmojiName = TIER_EMOJI_ALIAS[tier];
    const emoji = guild?.emojis.cache.find((candidate) => {
        const name = candidate.name?.toLowerCase();
        return name === desiredEmojiName;
    });
    if (emoji) return `<:${emoji.name}:${emoji.id}>`;
    return `[${TIER_META[tier].label}](${TIER_META[tier].iconUrl})`;
}

function formatPlayerLink(playerName: string): string {
    return `[${playerName}](${RCL_HUB_PLAYER_BASE}/${encodeURIComponent(playerName)})`;
}

export function formatQueuePlayers(
    entries: QueueModeStateEntry[],
    options?: { guild?: Guild | null; maxPlayers?: number }
): string {
    if (entries.length === 0) return "_Empty_";
    const guild = options?.guild;
    const maxPlayers = options?.maxPlayers ?? 6;

    const lines = entries.slice(0, Math.max(1, maxPlayers)).map((entry, index) => {
        const tier = resolveQueueTier(entry.ratingElo);
        const tierBadge = tier ? resolveTierBadge(tier, guild) : "";
        const playerLink = formatPlayerLink(entry.playerName);
        const badgePrefix = tierBadge ? `${tierBadge} ` : "";
        return `${index + 1}. ${badgePrefix}${playerLink}`;
    });

    if (entries.length > maxPlayers) {
        lines.push(`_+${entries.length - maxPlayers} more_`);
    }
    return lines.join("\n");
}

