import { container } from "@sapphire/framework";
import { config } from "../config/config";
import { normalizeQueueModeInput } from "./queuePresentation";

type QueueRequestMethod = "GET" | "POST";
type QueueScope = "open" | "beginner" | "pro";

type QueueRequestOptions = {
    method?: QueueRequestMethod;
    query?: Record<string, string | number | null | undefined>;
    body?: unknown;
    dispatcher?: unknown;
    signal?: AbortSignal;
};

type QueueRequestHeaders = Record<string, string>;

type QueuePushResult = {
    attempted: number;
    successfulModes: string[];
    failedModes: Array<{ mode: string; error: string }>;
    skippedPlaylists: string[];
};

type QueueJoinRequest = {
    mode: string;
    discordId: string;
    username: string;
    scope: QueueScope;
};

type QueueLeaveRequest = QueueJoinRequest;

type QueueApiRatingSnapshot = {
    value: number | null;
    source: string | null;
    updatedAt: string | null;
    rankingRank: number | null;
};

export type QueueApiErrorBody = {
    ok?: boolean;
    error?: string;
    code?: string;
    message?: string;
    [key: string]: unknown;
};

export class QueueApiRequestError extends Error {
    public readonly status: number;
    public readonly body: QueueApiErrorBody | null;
    public readonly method: QueueRequestMethod;
    public readonly url: string;

    public constructor(options: {
        message: string;
        status: number;
        body: QueueApiErrorBody | null;
        method: QueueRequestMethod;
        url: string;
    }) {
        super(options.message);
        this.name = "QueueApiRequestError";
        this.status = options.status;
        this.body = options.body;
        this.method = options.method;
        this.url = options.url;
    }
}

export function isQueueApiRequestError(value: unknown): value is QueueApiRequestError {
    return value instanceof QueueApiRequestError;
}

export type QueueModeStateEntry = {
    id: string;
    playerName: string;
    queuedAt: string;
    sourceServer: string | null;
    ratingElo: number | null;
    rankingRank: number | null;
};

export type QueueModeStateResult = {
    ttlMs?: number;
    scope: QueueScope;
    identity: {
        playerName: string;
        verificationState: "unverified" | "verified";
    } | null;
    mode: {
        id: string;
        name?: string;
        shortName?: string;
        label?: string;
        requiredPlayers?: number;
        requiredCount: number;
        currentCount: number;
        scope: QueueScope;
        entries: QueueModeStateEntry[];
        targetServer?: string | null;
    };
};

export type QueuePopResult = {
    id: string;
    mode: string;
    scope: QueueScope;
    targetServer: string | null;
    targetServerName?: string | null;
    eventId?: string | null;
    leagueSlug?: string | null;
    gameMode?: string | null;
    machineId?: string | null;
    projectKey?: string | null;
    allocationMetadata?: Record<string, unknown> | null;
    playerNames: string[];
    poppedAt: string;
    completedAt: string | null;
};

export type QueueModeStateByScope = Record<QueueScope, string[]>;

export type QueueScopeEligibilityState = {
    eligible: boolean;
    code: string | null;
    message: string | null;
};

export type DiscordQueueStatusResult = {
    ok: boolean;
    ttlMs: number;
    discordUserId: string;
    scope: QueueScope;
    playerName: string;
    playerNameAliases: string[];
    verificationState: "unverified" | "verified";
    queuedModes: string[];
    queuedModesByScope: QueueModeStateByScope;
    allModes: string[];
    defaultQueues: string[] | null;
    rating: QueueApiRatingSnapshot | null;
    eligibilityByScope?: Record<QueueScope, QueueScopeEligibilityState>;
};

type QueueModeStats = {
    matchesPlayed: number;
    kills?: number;
    deaths?: number;
    kd?: number | null;
    totalPoints?: number;
    avgPoints?: number | null;
    avgPosition?: number | null;
    highScore?: number;
    winRate?: number | null;
    latestChange?: number | null;
    monthDelta?: number | null;
    lastActive?: string | null;
    comingSoon?: boolean;
};

export type DiscordPlayerProfileResult = {
    ok: boolean;
    schemaReady: boolean;
    hubStatsReady: boolean;
    discordUserId: string;
    playerName: string;
    verificationState: "unverified" | "verified";
    profileAvailable: boolean;
    profileUrl: string | null;
    identities: {
        primaryLoginId: string | null;
        username: string | null;
        linkedLogins: string[];
        allKnownNames: string[];
    };
    rating: {
        value: number | null;
        source: string | null;
        updatedAt: string | null;
        rankingRank: number | null;
        tier: string | null;
    };
    summary: {
        matchesPlayed: number;
        byMode: {
            tst: number;
            fort: number;
            sumobar: number;
        };
        latestMatchAt: string | null;
    };
    modes: {
        tst: QueueModeStats;
        sumobar: QueueModeStats;
        fort: QueueModeStats;
    };
};

export type DiscordVerificationLinkResult = {
    ok: boolean;
    discordUserId: string;
    verificationState: "unverified" | "verified";
    provisionalPlayerName: string;
    verifyUrl: string;
    tokenExpiresInSeconds: number;
};

export type PlayerDirectoryEntry = {
    id: string;
    source: string;
    sourceKey: string;
    displayName: string;
    legacyLogins: string[];
    discordUserIds: string[];
    ratingElo: number | null;
    rankingRank: number | null;
    ratingUpdatedAt: string | null;
    updatedAt: string | null;
};

export type PlayerDirectorySnapshot = {
    ok: boolean;
    generatedAt: string;
    entries: PlayerDirectoryEntry[];
};

export type DashboardAgentMode = "ask" | "agent" | "linear";

export type DashboardAgentAskResult = {
    ok: boolean;
    answer: string;
    sessionId: string;
    durationMs: number;
};

const VALID_SCOPES: QueueScope[] = ["open", "beginner", "pro"];
const API_HOST_HEADER_VALUE = String(process.env.RCL_API_HOST || "").trim();
export const AGENT_ASK_TIMEOUT_MS = 900_000;
const AGENT_ASK_DISPATCHER = createAgentAskDispatcher();

function createAgentAskDispatcher(): unknown {
    try {
        const undici = require("undici") as {
            Agent?: new (options: Record<string, unknown>) => unknown;
        };
        if (!undici.Agent) return undefined;
        return new undici.Agent({
            connect: { timeout: AGENT_ASK_TIMEOUT_MS },
            headersTimeout: AGENT_ASK_TIMEOUT_MS,
            bodyTimeout: AGENT_ASK_TIMEOUT_MS,
        });
    } catch {
        return undefined;
    }
}

function normalizeApiUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function buildQueueRequestHeaders(method: QueueRequestMethod, hasBody: boolean): QueueRequestHeaders {
    const headers: QueueRequestHeaders = {
        authorization: `Bearer ${config.RCL_API_KEY}`,
        accept: "application/json",
    };
    if (hasBody && method !== "GET") {
        headers["content-type"] = "application/json";
    }
    if (API_HOST_HEADER_VALUE) {
        headers["x-rcl-api-host"] = API_HOST_HEADER_VALUE;
    }
    return headers;
}

function buildQueueRequestUrl(path: string, query?: Record<string, string | number | null | undefined>): string {
    if (!config.RCL_API_URL) {
        throw new Error("RCL_API_URL or RCL_API_KEY is missing");
    }
    const base = normalizeApiUrl(config.RCL_API_URL);
    const url = new URL(`${base}${path}`);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value == null) continue;
            const trimmed = String(value).trim();
            if (!trimmed) continue;
            url.searchParams.set(key, trimmed);
        }
    }
    return url.toString();
}

function queueApiDisabledResult(): QueuePushResult {
    return {
        attempted: 0,
        successfulModes: [],
        failedModes: [],
        skippedPlaylists: [],
    };
}

function ensureQueueApiConfigured(): void {
    if (!config.RCL_API_URL || !config.RCL_API_KEY) {
        throw new Error("RCL_API_URL or RCL_API_KEY is missing");
    }
}

function normalizeQueueApiErrorMessage(status: number, body: QueueApiErrorBody | null): string {
    if (typeof body?.message === "string" && body.message.trim().length > 0) {
        return body.message;
    }
    if (typeof body?.error === "string" && body.error.trim().length > 0) {
        return body.error;
    }
    if (typeof body?.code === "string" && body.code.trim().length > 0) {
        return body.code;
    }
    return `HTTP ${status}`;
}

async function queueRequest<T>(path: string, options: QueueRequestOptions = {}): Promise<T> {
    ensureQueueApiConfigured();

    const method = options.method || "GET";
    const hasBody = options.body !== undefined;
    const url = buildQueueRequestUrl(path, options.query);
    const requestInit: RequestInit & { dispatcher?: unknown } = {
        method,
        headers: buildQueueRequestHeaders(method, hasBody),
        signal: options.signal,
    };
    if (hasBody) {
        requestInit.body = JSON.stringify(options.body);
    }
    if (options.dispatcher !== undefined) {
        requestInit.dispatcher = options.dispatcher;
    }

    const response = await fetch(url, requestInit);
    const rawText = await response.text().catch(() => "");
    let parsedBody: QueueApiErrorBody | null = null;
    if (rawText) {
        try {
            parsedBody = JSON.parse(rawText) as QueueApiErrorBody;
        } catch {
            parsedBody = { message: rawText };
        }
    }

    if (!response.ok) {
        throw new QueueApiRequestError({
            message: normalizeQueueApiErrorMessage(response.status, parsedBody),
            status: response.status,
            body: parsedBody,
            method,
            url,
        });
    }

    return ((parsedBody || {}) as unknown) as T;
}

function normalizeQueueModesFromPlaylists(playlists: Iterable<string>): {
    modes: string[];
    skippedPlaylists: string[];
} {
    const uniqueModes = new Set<string>();
    const skippedPlaylists: string[] = [];
    for (const playlist of playlists) {
        const mode = getQueueModeFromPlaylist(playlist);
        if (mode) uniqueModes.add(mode);
        else skippedPlaylists.push(String(playlist));
    }
    return { modes: [...uniqueModes], skippedPlaylists };
}

function formatQueueOperationError(error: unknown): string {
    if (isQueueApiRequestError(error)) return error.message;
    return error instanceof Error ? error.message : "Unknown queue API error";
}

function getQueueModeFromPlaylist(playlist: string): string | undefined {
    const normalized = normalizeQueueModeInput(playlist);
    return normalized || undefined;
}

async function postQueueJoin(request: QueueJoinRequest): Promise<void> {
    await queueRequest("/api/queue/bot/join", {
        method: "POST",
        body: {
            mode: request.mode,
            scope: request.scope,
            playerName: request.username,
            discordUserId: request.discordId,
            discordUsername: request.username,
            source: `discord:${request.discordId}`,
        },
    });
}

async function postQueueLeave(request: QueueLeaveRequest): Promise<void> {
    await queueRequest("/api/queue/bot/leave", {
        method: "POST",
        body: {
            mode: request.mode,
            scope: request.scope,
            playerName: request.username,
            discordUserId: request.discordId,
            discordUsername: request.username,
        },
    });
}

export function normalizeQueueScope(value: unknown, fallback: QueueScope = "open"): QueueScope {
    const normalized = String(value || "").trim().toLowerCase() as QueueScope;
    return VALID_SCOPES.includes(normalized) ? normalized : fallback;
}

export async function pushDiscordAddToQueueApi(
    playlists: Iterable<string>,
    discordId: string,
    username: string,
    options?: { scope?: QueueScope }
): Promise<QueuePushResult> {
    if (!config.RCL_API_URL || !config.RCL_API_KEY) {
        container.logger.debug("Queue API integration disabled (missing RCL_API_URL or RCL_API_KEY)");
        return queueApiDisabledResult();
    }

    const scope = normalizeQueueScope(options?.scope || "open");
    const { modes, skippedPlaylists } = normalizeQueueModesFromPlaylists(playlists);
    const successfulModes: string[] = [];
    const failedModes: Array<{ mode: string; error: string }> = [];

    for (const mode of modes) {
        try {
            await postQueueJoin({ mode, discordId, username, scope });
            successfulModes.push(mode);
        } catch (error) {
            failedModes.push({ mode, error: formatQueueOperationError(error) });
        }
    }

    if (failedModes.length > 0) {
        container.logger.warn(
            `Queue API add failures for ${username} (${discordId}) scope=${scope}: ${JSON.stringify(failedModes)}`
        );
    }

    return {
        attempted: modes.length,
        successfulModes,
        failedModes,
        skippedPlaylists,
    };
}

export async function pushDiscordRemoveFromQueueApi(
    playlists: Iterable<string>,
    discordId: string,
    username: string,
    options?: { removeAllWhenEmpty?: boolean; scope?: QueueScope }
): Promise<QueuePushResult> {
    if (!config.RCL_API_URL || !config.RCL_API_KEY) {
        container.logger.debug("Queue API integration disabled (missing RCL_API_URL or RCL_API_KEY)");
        return queueApiDisabledResult();
    }

    const scope = normalizeQueueScope(options?.scope || "open");
    const normalized = normalizeQueueModesFromPlaylists(playlists);
    let modes = normalized.modes;
    const skippedPlaylists = [...normalized.skippedPlaylists];

    if (modes.length === 0 && options?.removeAllWhenEmpty) {
        try {
            const status = await getDiscordQueueStatus(discordId, username, scope);
            modes = Array.from(new Set((status.queuedModes || []).map((mode) => String(mode).toLowerCase())));
        } catch (error) {
            container.logger.debug(`Failed to resolve queued modes for remove-all ${discordId}: ${error}`);
        }
    }

    const successfulModes: string[] = [];
    const failedModes: Array<{ mode: string; error: string }> = [];

    for (const mode of modes) {
        try {
            await postQueueLeave({ mode, discordId, username, scope });
            successfulModes.push(mode);
        } catch (error) {
            failedModes.push({ mode, error: formatQueueOperationError(error) });
        }
    }

    if (failedModes.length > 0) {
        container.logger.warn(
            `Queue API remove failures for ${username} (${discordId}) scope=${scope}: ${JSON.stringify(failedModes)}`
        );
    }

    return {
        attempted: modes.length,
        successfulModes,
        failedModes,
        skippedPlaylists,
    };
}

export async function queueJoinMode(
    mode: string,
    discordId: string,
    username: string,
    scope: QueueScope = "open"
): Promise<void> {
    const normalizedMode = getQueueModeFromPlaylist(mode) || String(mode || "").trim().toLowerCase();
    if (!normalizedMode) {
        throw new Error("mode is required");
    }
    await postQueueJoin({
        mode: normalizedMode,
        discordId,
        username,
        scope: normalizeQueueScope(scope),
    });
}

export async function queueLeaveMode(
    mode: string,
    discordId: string,
    username: string,
    scope: QueueScope = "open"
): Promise<void> {
    const normalizedMode = getQueueModeFromPlaylist(mode) || String(mode || "").trim().toLowerCase();
    if (!normalizedMode) {
        throw new Error("mode is required");
    }
    await postQueueLeave({
        mode: normalizedMode,
        discordId,
        username,
        scope: normalizeQueueScope(scope),
    });
}

export async function getQueueModeState(mode: string, scope: QueueScope = "open"): Promise<QueueModeStateResult> {
    const payload = await queueRequest<QueueModeStateResult>("/api/queue/bot/state", {
        query: {
            mode,
            scope: normalizeQueueScope(scope),
        },
    });
    const requiredCount =
        typeof payload?.mode?.requiredCount === "number"
            ? payload.mode.requiredCount
            : Number(payload?.mode?.requiredPlayers || 0);
    return {
        ...payload,
        scope: normalizeQueueScope(payload.scope, normalizeQueueScope(scope)),
        mode: {
            ...payload.mode,
            requiredCount,
            scope: normalizeQueueScope(payload.mode.scope, normalizeQueueScope(scope)),
            entries: Array.isArray(payload.mode.entries) ? payload.mode.entries : [],
        },
    };
}

export async function getQueuePops(options?: {
    since?: string;
    limit?: number;
    scope?: QueueScope;
}): Promise<QueuePopResult[]> {
    const payload = await queueRequest<{ pops?: QueuePopResult[] }>("/api/queue/bot/pops", {
        query: {
            since: options?.since,
            limit: options?.limit ?? 20,
            scope: options?.scope ? normalizeQueueScope(options.scope) : undefined,
        },
    });
    return Array.isArray(payload.pops) ? payload.pops : [];
}

export async function simulateQueuePop(options?: {
    mode?: string;
    scope?: QueueScope;
}): Promise<QueuePopResult> {
    const payload = await queueRequest<{ pop?: QueuePopResult }>("/api/queue/bot/simulate-pop", {
        query: {
            mode: options?.mode || "tst",
            scope: options?.scope ? normalizeQueueScope(options.scope) : "open",
        },
    });
    if (!payload.pop) {
        throw new Error("Simulation response missing pop payload");
    }
    return payload.pop;
}

export async function getDiscordQueueStatus(
    discordUserId: string,
    discordUsername: string,
    scope: QueueScope = "open"
): Promise<DiscordQueueStatusResult> {
    return queueRequest<DiscordQueueStatusResult>("/api/queue/bot/discord/status", {
        query: {
            discordUserId,
            discordUsername,
            scope: normalizeQueueScope(scope),
        },
    });
}

export async function getDiscordPlayerProfile(
    discordUserId: string,
    discordUsername: string
): Promise<DiscordPlayerProfileResult> {
    return queueRequest<DiscordPlayerProfileResult>("/api/queue/bot/discord/profile", {
        query: {
            discordUserId,
            discordUsername,
        },
    });
}

export async function createDiscordVerificationLink(
    discordUserId: string,
    discordUsername: string
): Promise<DiscordVerificationLinkResult> {
    return queueRequest<DiscordVerificationLinkResult>("/api/queue/bot/discord/link/start", {
        method: "POST",
        body: {
            discordUserId,
            discordUsername,
        },
    });
}

export async function getPlayerDirectorySnapshot(): Promise<PlayerDirectorySnapshot> {
    return queueRequest<PlayerDirectorySnapshot>("/api/queue/bot/player-directory");
}

export async function askDashboardAgent(options: {
    message: string;
    sessionId?: string;
    mode?: DashboardAgentMode;
    discordRoleIds?: string[];
    linearWriteAuthorized?: boolean;
}): Promise<DashboardAgentAskResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_ASK_TIMEOUT_MS);
    try {
        const payload = await queueRequest<DashboardAgentAskResult>("/api/queue/bot/agent/ask", {
            method: "POST",
            body: {
                message: options.message,
                sessionId: options.sessionId,
                mode: options.mode || "ask",
                discordRoleIds: options.discordRoleIds || [],
                linearWriteAuthorized: options.linearWriteAuthorized === true,
            },
            signal: controller.signal,
            dispatcher: AGENT_ASK_DISPATCHER,
        });
        return {
            ok: !!payload.ok,
            answer: String(payload.answer || ""),
            sessionId: String(payload.sessionId || ""),
            durationMs:
                typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
                    ? payload.durationMs
                    : 0,
        };
    } finally {
        clearTimeout(timeout);
    }
}

