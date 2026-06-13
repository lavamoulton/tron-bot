import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { container } from "@sapphire/framework";
import { config } from "../config/config";

export type FortTier = "S" | "A" | "B" | "C" | "D" | "E" | "F";
export type FortTierSource = "google-sheet" | "default-f" | "fallback";

type GoogleServiceAccount = {
    client_email: string;
    private_key: string;
    token_uri?: string;
};

export type FortBalancePlayer = {
    playerName: string;
    discordId: string;
};

export type FortBalancePlayerDetail = {
    playerName: string;
    discordId: string;
    tier: FortTier;
    tierSource: FortTierSource;
    score: number;
    nickname: string | null;
    isCaptain: boolean;
};

export type FortBalanceTeam = {
    teamIndex: 1 | 2;
    label: "Blue" | "Gold";
    playerNames: string[];
    playerIds: string[];
    playerDetails: FortBalancePlayerDetail[];
    captainPlayerName: string | null;
    captainDiscordId: string | null;
    score: number;
};

export type FortBalanceResult = {
    teams: FortBalanceTeam[];
    thresholdMet: boolean;
    balanceConfidence: number;
    matchQuality: number;
    parity: number;
    tierSource: "google-sheet" | "fallback";
    loadedAt: string | null;
    sheetPlayerCount: number;
    defaultedPlayerCount: number;
};

const SCORE_MAP: Record<FortTier, number> = {
    S: 7,
    A: 6,
    B: 5,
    C: 4,
    D: 3,
    E: 2,
    F: 1,
};

const TIER_ORDER: FortTier[] = ["S", "A", "B", "C", "D", "E", "F"];
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64Url(value: string): string {
    return Buffer.from(value).toString("base64url");
}

function randomShuffle<T>(values: T[]): T[] {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function parseSheetId(sheetUrl: string | undefined): string | null {
    if (!sheetUrl) return null;
    const trimmed = sheetUrl.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([^/]+)/);
    return match ? match[1] : trimmed || null;
}

function percentileStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
        values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

function formatPrivateKey(raw: string): string {
    return raw.replace(/\\n/g, "\n");
}

function logWarn(message: string): void {
    if (container.logger?.warn) {
        container.logger.warn(message);
    } else {
        // Keep standalone smoke tests from crashing before Sapphire initializes logging.
        console.warn(message);
    }
}

async function loadCredentials(): Promise<GoogleServiceAccount | null> {
    if (config.FORT_TIER_GOOGLE_CREDENTIALS_JSON) {
        const parsed = JSON.parse(config.FORT_TIER_GOOGLE_CREDENTIALS_JSON) as GoogleServiceAccount;
        return {
            ...parsed,
            private_key: formatPrivateKey(parsed.private_key),
        };
    }
    if (config.FORT_TIER_GOOGLE_CREDENTIALS_PATH) {
        const raw = await readFile(config.FORT_TIER_GOOGLE_CREDENTIALS_PATH, "utf8");
        const parsed = JSON.parse(raw) as GoogleServiceAccount;
        return {
            ...parsed,
            private_key: formatPrivateKey(parsed.private_key),
        };
    }
    return null;
}

function signJwt(credentials: GoogleServiceAccount): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64Url(
        JSON.stringify({
            iss: credentials.client_email,
            scope: GOOGLE_SCOPE,
            aud: credentials.token_uri || DEFAULT_TOKEN_URI,
            exp: nowSeconds + 3600,
            iat: nowSeconds,
        })
    );
    const unsigned = `${header}.${claim}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(credentials.private_key, "base64url");
    return `${unsigned}.${signature}`;
}

export class FortTierBalancer {
    private tierDict: Record<FortTier, Set<string>> = {
        S: new Set(),
        A: new Set(),
        B: new Set(),
        C: new Set(),
        D: new Set(),
        E: new Set(),
        F: new Set(),
    };
    private everyone = new Set<string>();
    private nicknameByDiscordId = new Map<string, string>();
    private loadedAt: string | null = null;
    private sheetPlayerCount = 0;
    private accessToken: { value: string; expiresAt: number } | null = null;

    public get isLoaded(): boolean {
        return this.loadedAt !== null;
    }

    public async reload(): Promise<{ loaded: boolean; players: number; loadedAt: string | null }> {
        const sheetId = parseSheetId(config.FORT_TIER_SHEET_URL);
        const credentials = await loadCredentials();
        if (!sheetId || !credentials?.client_email || !credentials.private_key) {
            logWarn(
                "Fort tier balancing is using fallback tiers (missing FORT_TIER_SHEET_URL or Google credentials)."
            );
            return { loaded: false, players: this.everyone.size, loadedAt: this.loadedAt };
        }

        const token = await this.getGoogleAccessToken(credentials);
        const worksheetName = encodeURIComponent(config.FORT_TIER_WORKSHEET_NAME || "Sheet1");
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${worksheetName}`,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );
        if (!response.ok) {
            throw new Error(`Google Sheets tier fetch failed (${response.status})`);
        }

        const json = await response.json();
        const rows: string[][] = Array.isArray(json?.values) ? json.values : [];
        const headers = (rows[0] || []).map((header) => String(header).trim());
        const normalizedHeaders = headers.map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
        const discordIndex = normalizedHeaders.findIndex((header) => header === "discordid");
        const tierIndex = normalizedHeaders.findIndex((header) => header === "tier");
        const nicknameIndex = normalizedHeaders.findIndex((header) =>
            ["nickname", "nicknames", "nick", "name", "names", "player", "playername", "username"].includes(header)
        );
        if (discordIndex < 0 || tierIndex < 0) {
            throw new Error("Fort tier sheet must contain DiscordId and Tier columns.");
        }

        const nextTierDict: Record<FortTier, Set<string>> = {
            S: new Set(),
            A: new Set(),
            B: new Set(),
            C: new Set(),
            D: new Set(),
            E: new Set(),
            F: new Set(),
        };
        const nextNicknameByDiscordId = new Map<string, string>();
        for (const row of rows.slice(1)) {
            const discordId = String(row[discordIndex] || "").trim();
            const tier = String(row[tierIndex] || "").trim().toUpperCase() as FortTier;
            if (!/^\d{17,20}$/.test(discordId) || !TIER_ORDER.includes(tier)) continue;
            nextTierDict[tier].add(discordId);
            if (nicknameIndex >= 0) {
                const nickname = String(row[nicknameIndex] || "").trim();
                if (nickname) nextNicknameByDiscordId.set(discordId, nickname);
            }
        }

        this.tierDict = nextTierDict;
        this.everyone = new Set(TIER_ORDER.flatMap((tier) => [...nextTierDict[tier]]));
        this.nicknameByDiscordId = nextNicknameByDiscordId;
        this.sheetPlayerCount = this.everyone.size;
        this.loadedAt = new Date().toISOString();
        return { loaded: true, players: this.everyone.size, loadedAt: this.loadedAt };
    }

    public async ensureLoaded(): Promise<void> {
        if (this.loadedAt) return;
        try {
            await this.reload();
        } catch (error) {
            logWarn(`Failed loading Fort tier sheet; fallback tiers active: ${error}`);
        }
    }

    private async getGoogleAccessToken(credentials: GoogleServiceAccount): Promise<string> {
        if (this.accessToken && Date.now() < this.accessToken.expiresAt) {
            return this.accessToken.value;
        }

        const assertion = signJwt(credentials);
        const response = await fetch(credentials.token_uri || DEFAULT_TOKEN_URI, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion,
            }),
        });
        if (!response.ok) {
            throw new Error(`Google OAuth token fetch failed (${response.status})`);
        }
        const json = await response.json();
        const accessToken = String(json?.access_token || "");
        const expiresIn = Number(json?.expires_in || 3600);
        if (!accessToken) throw new Error("Google OAuth token response missing access_token.");
        this.accessToken = {
            value: accessToken,
            expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
        };
        return accessToken;
    }

    private getSheetTier(playerId: string): FortTier | null {
        for (const tier of TIER_ORDER) {
            if (this.tierDict[tier].has(playerId)) return tier;
        }
        return null;
    }

    private getEffectiveTier(playerId: string): FortTier {
        return this.getSheetTier(playerId) || "F";
    }

    private getTierSource(playerId: string): FortTierSource {
        if (this.getSheetTier(playerId)) return "google-sheet";
        return this.loadedAt ? "default-f" : "fallback";
    }

    private getScorePlayer(playerId: string): number {
        return SCORE_MAP[this.getEffectiveTier(playerId)];
    }

    private getScore(team: string[]): number {
        return team.reduce((sum, playerId) => sum + this.getScorePlayer(playerId), 0);
    }

    public getNickname(playerId: string | null | undefined): string | null {
        const key = String(playerId || "").trim();
        if (!key) return null;
        return this.nicknameByDiscordId.get(key) || null;
    }

    public hasSheetPlayer(playerId: string | null | undefined): boolean {
        const key = String(playerId || "").trim();
        return Boolean(key) && this.everyone.has(key);
    }

    private getCaptain(team: string[]): string | null {
        const teamCopy = randomShuffle(team);
        for (const playerId of teamCopy) {
            if (this.getScorePlayer(playerId) >= 4) return playerId;
        }
        return teamCopy[0] || null;
    }

    private getBalance(teamBlue: string[], teamGold: string[], queue: string[]): number {
        const blueScore = this.getScore(teamBlue);
        const goldScore = this.getScore(teamGold);
        const lobbyScore = blueScore + goldScore;
        if (lobbyScore === 0) return 100;

        const diff = Math.abs(blueScore - goldScore);
        const baseBalance = (1 - diff / lobbyScore) * 100;
        return Math.round((0.9 * baseBalance + 0.1 * this.getGrade(queue)) * 10) / 10;
    }

    private getGrade(queue: string[]): number {
        const totalScore = queue.reduce((sum, playerId) => sum + this.getScorePlayer(playerId), 0);
        const minScore = 12;
        const maxScore = 79;
        if (totalScore <= minScore) return 0;
        if (totalScore >= maxScore) return 100;
        return Math.round(((totalScore - minScore) / (maxScore - minScore)) * 1000) / 10;
    }

    private getParity(queue: string[]): number {
        const scores = queue.map((playerId) => this.getScorePlayer(playerId));
        return Math.round(percentileStdDev(scores) * 100) / 100;
    }

    private getPlayerDetail(
        playerId: string,
        byId: Map<string, FortBalancePlayer>,
        isCaptain: boolean
    ): FortBalancePlayerDetail {
        const tier = this.getEffectiveTier(playerId);
        return {
            playerName: byId.get(playerId)?.playerName || playerId,
            discordId: playerId,
            tier,
            tierSource: this.getTierSource(playerId),
            score: SCORE_MAP[tier],
            nickname: this.getNickname(playerId),
            isCaptain,
        };
    }

    private makeTeams(queue: string[]): {
        teamBlue: string[];
        teamGold: string[];
        thresholdMet: boolean;
    } {
        const sortedQueue: string[] = [];
        const seen = new Set<string>();
        for (const tier of TIER_ORDER) {
            for (const playerId of queue) {
                if (this.getEffectiveTier(playerId) === tier && !seen.has(playerId)) {
                    sortedQueue.push(playerId);
                    seen.add(playerId);
                }
            }
        }

        const tophalf = sortedQueue.slice(0, 4);
        const backhalf = sortedQueue.slice(4);
        let shuffledTophalf = randomShuffle(tophalf);
        let teamBlue = shuffledTophalf.slice(0, 2);
        let teamGold = shuffledTophalf.slice(2);

        let bestBlue = [...teamBlue];
        let bestGold = [...teamGold];
        let bestDiff = Math.abs(this.getScore(teamBlue) - this.getScore(teamGold));
        let thresholdMet = bestDiff < 3;

        for (let attempt = 0; attempt < 100; attempt += 1) {
            if (thresholdMet) break;
            shuffledTophalf = randomShuffle(tophalf);
            teamBlue = shuffledTophalf.slice(0, 2);
            teamGold = shuffledTophalf.slice(2);
            const diff = Math.abs(this.getScore(teamBlue) - this.getScore(teamGold));
            if (diff < bestDiff) {
                bestDiff = diff;
                bestBlue = [...teamBlue];
                bestGold = [...teamGold];
            }
            if (diff < 3) thresholdMet = true;
        }

        teamBlue = bestBlue;
        teamGold = bestGold;

        const remaining = [...backhalf];
        while (remaining.length >= 2) {
            if (this.getScore(teamBlue) === this.getScore(teamGold)) {
                teamBlue.push(remaining[0]);
                teamGold.push(remaining[1]);
                remaining.splice(0, 2);
            } else if (this.getScore(teamBlue) > this.getScore(teamGold)) {
                teamBlue.push(remaining[remaining.length - 1]);
                teamGold.push(remaining[0]);
                remaining.pop();
                remaining.shift();
            } else {
                teamGold.push(remaining[remaining.length - 1]);
                teamBlue.push(remaining[0]);
                remaining.pop();
                remaining.shift();
            }
        }

        // Preserve the live bot's historical return/caller behavior:
        // make_teams returns (team_gold, team_blue), which the caller labels Blue/Gold.
        return { teamBlue: teamGold, teamGold: teamBlue, thresholdMet };
    }

    public async balance(players: FortBalancePlayer[]): Promise<FortBalanceResult | null> {
        if (players.length < 2) return null;
        await this.ensureLoaded();
        const queue = players.map((player) => player.discordId);
        const byId = new Map(players.map((player) => [player.discordId, player]));
        const { teamBlue, teamGold, thresholdMet } = this.makeTeams(queue);
        const blueCaptain = this.getCaptain(teamBlue);
        const goldCaptain = this.getCaptain(teamGold);
        const toShuffledTeam = (team: string[], captainId: string | null) => {
            const playerIds = randomShuffle(team);
            return {
                playerIds,
                playerDetails: playerIds.map((playerId) =>
                    this.getPlayerDetail(playerId, byId, playerId === captainId)
                ),
            };
        };
        const bluePlayers = toShuffledTeam(teamBlue, blueCaptain);
        const goldPlayers = toShuffledTeam(teamGold, goldCaptain);
        const defaultedPlayerCount = new Set(
            queue.filter((playerId) => this.getTierSource(playerId) !== "google-sheet")
        ).size;

        return {
            teams: [
                {
                    teamIndex: 1,
                    label: "Blue",
                    playerNames: bluePlayers.playerDetails.map((player) => player.playerName),
                    playerIds: bluePlayers.playerIds,
                    playerDetails: bluePlayers.playerDetails,
                    captainPlayerName: blueCaptain ? byId.get(blueCaptain)?.playerName || blueCaptain : null,
                    captainDiscordId: blueCaptain,
                    score: this.getScore(teamBlue),
                },
                {
                    teamIndex: 2,
                    label: "Gold",
                    playerNames: goldPlayers.playerDetails.map((player) => player.playerName),
                    playerIds: goldPlayers.playerIds,
                    playerDetails: goldPlayers.playerDetails,
                    captainPlayerName: goldCaptain ? byId.get(goldCaptain)?.playerName || goldCaptain : null,
                    captainDiscordId: goldCaptain,
                    score: this.getScore(teamGold),
                },
            ],
            thresholdMet,
            balanceConfidence: this.getBalance(teamBlue, teamGold, queue),
            matchQuality: this.getGrade(queue),
            parity: this.getParity(queue),
            tierSource: this.loadedAt ? "google-sheet" : "fallback",
            loadedAt: this.loadedAt,
            sheetPlayerCount: this.sheetPlayerCount,
            defaultedPlayerCount,
        };
    }
}

export const fortTierBalancer = new FortTierBalancer();
