import { container } from "@sapphire/framework";
import { getRootData } from "@sapphire/pieces";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "../config/config";
import {
    getPlayerDirectorySnapshot,
    type PlayerDirectoryEntry,
    type PlayerDirectorySnapshot,
} from "./rclQueueApi";

const CACHE_FILENAME = "player-directory-cache.json";
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

type PersistedPlayerDirectoryCache = PlayerDirectorySnapshot & {
    fetchedAt: string;
};

function normalizeLookupKey(value: string): string {
    return String(value || "").trim().toLowerCase();
}

export class PlayerDirectoryCache {
    private readonly cachePath = join(getRootData().root, config.DATA_PATH, CACHE_FILENAME);
    private entries: PlayerDirectoryEntry[] = [];
    private byDiscordUserId = new Map<string, PlayerDirectoryEntry>();
    private byPlayerName = new Map<string, PlayerDirectoryEntry>();
    private fetchedAtMs = 0;
    private lastRefreshAttemptMs = 0;
    private refreshActive = false;
    private started = false;

    public async start(): Promise<void> {
        if (this.started) return;
        if (!config.RCL_API_URL || !config.RCL_API_KEY) {
            container.logger.info("Player directory cache disabled (missing RCL_API_URL/RCL_API_KEY)");
            return;
        }
        this.started = true;
        await this.loadFromDisk();
        await this.ensureFresh();
        setInterval(() => void this.ensureFresh(), REFRESH_INTERVAL_MS);
    }

    public async ensureFresh(): Promise<void> {
        const latestRefreshMs = Math.max(this.fetchedAtMs, this.lastRefreshAttemptMs);
        if (Date.now() - latestRefreshMs < REFRESH_INTERVAL_MS) return;
        await this.refresh();
    }

    public getByDiscordUserId(discordUserId: string | null | undefined): PlayerDirectoryEntry | null {
        const key = String(discordUserId || "").trim();
        if (!key) return null;
        return this.byDiscordUserId.get(key) || null;
    }

    public getByPlayerName(playerName: string | null | undefined): PlayerDirectoryEntry | null {
        const key = normalizeLookupKey(String(playerName || ""));
        if (!key) return null;
        return this.byPlayerName.get(key) || null;
    }

    private async loadFromDisk(): Promise<void> {
        try {
            const raw = await readFile(this.cachePath, "utf8");
            const parsed = JSON.parse(raw) as PersistedPlayerDirectoryCache;
            if (!Array.isArray(parsed.entries)) return;
            this.applySnapshot(parsed);
            container.logger.info(
                `Loaded player directory cache (${this.entries.length} entries, ${parsed.fetchedAt || "unknown time"})`
            );
        } catch {
            // Cache is optional; first refresh will create it.
        }
    }

    private async refresh(): Promise<void> {
        if (this.refreshActive) return;
        this.refreshActive = true;
        this.lastRefreshAttemptMs = Date.now();
        try {
            const snapshot = await getPlayerDirectorySnapshot();
            const persisted: PersistedPlayerDirectoryCache = {
                ...snapshot,
                fetchedAt: new Date().toISOString(),
            };
            this.applySnapshot(persisted);
            await mkdir(dirname(this.cachePath), { recursive: true });
            await writeFile(this.cachePath, JSON.stringify(persisted, null, 2));
            container.logger.info(`Refreshed player directory cache (${this.entries.length} entries)`);
        } catch (error) {
            container.logger.warn(`Failed refreshing player directory cache: ${error}`);
        } finally {
            this.refreshActive = false;
        }
    }

    private applySnapshot(snapshot: PersistedPlayerDirectoryCache): void {
        this.entries = snapshot.entries.filter((entry) => entry && typeof entry === "object");
        const fetchedAtMs = Date.parse(snapshot.fetchedAt || snapshot.generatedAt || "");
        this.fetchedAtMs = Number.isFinite(fetchedAtMs) ? fetchedAtMs : 0;
        this.rebuildIndexes();
    }

    private rebuildIndexes(): void {
        this.byDiscordUserId = new Map();
        this.byPlayerName = new Map();

        for (const entry of this.entries) {
            for (const discordUserId of entry.discordUserIds || []) {
                const key = String(discordUserId || "").trim();
                if (key && !this.byDiscordUserId.has(key)) {
                    this.byDiscordUserId.set(key, entry);
                }
            }

            const aliases = [entry.displayName, entry.sourceKey, ...(entry.legacyLogins || [])];
            for (const alias of aliases) {
                const key = normalizeLookupKey(alias);
                if (key && !this.byPlayerName.has(key)) {
                    this.byPlayerName.set(key, entry);
                }
            }
        }
    }
}

export const playerDirectoryCache = new PlayerDirectoryCache();
