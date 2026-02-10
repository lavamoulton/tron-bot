import { container } from "@sapphire/framework";
import { config } from "../config/config";

type QueueJoinRequest = {
    mode: string;
    discordId: string;
    username: string;
};

type QueuePushResult = {
    attempted: number;
    successfulModes: string[];
    failedModes: Array<{ mode: string; error: string }>;
    skippedPlaylists: string[];
};

const PLAYLIST_TO_QUEUE_MODE: Record<string, string | undefined> = {
    fort: "fort",
    tst: "tst",
    tstplacement: "tst",
    sumo: "sumo",
    sumobar: "sumo",
    sumobarplacement: "sumo",
};

function normalizeApiUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function getQueueModeFromPlaylist(playlist: string): string | undefined {
    const normalized = playlist.toLowerCase();
    return PLAYLIST_TO_QUEUE_MODE[normalized];
}

async function postQueueJoin({ mode, discordId, username }: QueueJoinRequest): Promise<void> {
    if (!config.RCL_API_URL || !config.RCL_API_KEY) {
        throw new Error("RCL_API_URL or RCL_API_KEY is missing");
    }

    const url = `${normalizeApiUrl(config.RCL_API_URL)}/api/queue/bot/join`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.RCL_API_KEY}`,
        },
        body: JSON.stringify({
            mode,
            // Keep both fields for forward/backward compatibility.
            username,
            playerName: username,
            source: `discord:${discordId}`,
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ""}`);
    }
}

export async function pushDiscordAddToQueueApi(
    playlists: Iterable<string>,
    discordId: string,
    username: string
): Promise<QueuePushResult> {
    if (!config.RCL_API_URL || !config.RCL_API_KEY) {
        container.logger.debug("Queue API integration disabled (missing RCL_API_URL or RCL_API_KEY)");
        return {
            attempted: 0,
            successfulModes: [],
            failedModes: [],
            skippedPlaylists: [],
        };
    }

    const uniqueModes = new Set<string>();
    const skippedPlaylists: string[] = [];

    for (const playlist of playlists) {
        const mode = getQueueModeFromPlaylist(playlist);
        if (mode) {
            uniqueModes.add(mode);
        } else {
            skippedPlaylists.push(playlist);
        }
    }

    const successfulModes: string[] = [];
    const failedModes: Array<{ mode: string; error: string }> = [];

    for (const mode of uniqueModes) {
        try {
            await postQueueJoin({ mode, discordId, username });
            successfulModes.push(mode);
        } catch (error) {
            failedModes.push({
                mode,
                error: error instanceof Error ? error.message : "Unknown queue API error",
            });
        }
    }

    if (failedModes.length > 0) {
        container.logger.warn(
            `Queue API failures for ${username} (${discordId}): ${JSON.stringify(failedModes)}`
        );
    }

    return {
        attempted: uniqueModes.size,
        successfulModes,
        failedModes,
        skippedPlaylists,
    };
}

