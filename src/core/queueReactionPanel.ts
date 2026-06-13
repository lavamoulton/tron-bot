import * as fs from "node:fs";
import { join } from "node:path";
import type { QueueScope } from "../config/config";

export const QUEUE_REACTION_MODE_MAP: Record<string, string> = {
    "🔥": "fort",
    "⚔️": "tst",
    "🌀": "sumo",
};

export type QueueReactionPanelEntry = {
    channelId: string;
    messageId: string;
    scope: QueueScope;
};

type QueueReactionPanelState = {
    panels: QueueReactionPanelEntry[];
};

const STATE_FILENAME = "queue-reaction-panel-state.json";
const STATE_PATH = join(process.cwd(), STATE_FILENAME);

let cachedState: QueueReactionPanelState | null | undefined;

function readStateFromDisk(): QueueReactionPanelState | null {
    if (!fs.existsSync(STATE_PATH)) return null;
    try {
        const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as any;
        if (Array.isArray(parsed?.panels)) {
            return {
                panels: parsed.panels
                    .map((panel: any) => ({
                        channelId: String(panel?.channelId || "").trim(),
                        messageId: String(panel?.messageId || "").trim(),
                        scope:
                            panel?.scope === "beginner" || panel?.scope === "pro"
                                ? panel.scope
                                : "open",
                    }))
                    .filter((panel: QueueReactionPanelEntry) => panel.channelId && panel.messageId),
            };
        }

        // Backward compatibility with old singleton shape.
        if (parsed?.channelId && parsed?.messageId) {
            return {
                panels: [
                    {
                        channelId: String(parsed.channelId),
                        messageId: String(parsed.messageId),
                        scope: "open",
                    },
                ],
            };
        }
        return null;
    } catch {
        return null;
    }
}

export function getQueueReactionPanelState(): QueueReactionPanelState | null {
    if (cachedState === undefined) {
        cachedState = readStateFromDisk();
    }
    return cachedState ?? { panels: [] };
}

export function getQueueReactionPanels(): QueueReactionPanelEntry[] {
    return getQueueReactionPanelState()?.panels || [];
}

export function setQueueReactionPanelState(entry: {
    channelId: string;
    messageId: string;
    scope?: QueueScope;
}): void {
    const existing = getQueueReactionPanels();
    const nextPanel: QueueReactionPanelEntry = {
        channelId: entry.channelId,
        messageId: entry.messageId,
        scope: entry.scope || "open",
    };
    const filtered = existing.filter((panel) => !(panel.channelId === nextPanel.channelId && panel.scope === nextPanel.scope));
    cachedState = {
        panels: [...filtered, nextPanel],
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(cachedState, null, 2));
}

export function clearQueueReactionPanelState(): void {
    cachedState = { panels: [] };
    fs.writeFileSync(STATE_PATH, JSON.stringify(cachedState, null, 2));
}

export function getQueueReactionPanelForMessage(
    channelId: string,
    messageId: string
): QueueReactionPanelEntry | null {
    return (
        getQueueReactionPanels().find(
            (panel) => panel.channelId === channelId && panel.messageId === messageId
        ) || null
    );
}

export function getQueueReactionPanelForChannelScope(
    channelId: string,
    scope: QueueScope
): QueueReactionPanelEntry | null {
    return (
        getQueueReactionPanels().find(
            (panel) => panel.channelId === channelId && panel.scope === scope
        ) || null
    );
}

export function getQueueScopeForChannelFromPanels(channelId: string): QueueScope | null {
    const panel = getQueueReactionPanels().find((entry) => entry.channelId === channelId);
    return panel?.scope || null;
}

export function getQueueModeFromReaction(emoji: string): string | undefined {
    return QUEUE_REACTION_MODE_MAP[emoji];
}

export function getQueueReactionEmojis(): string[] {
    return Object.keys(QUEUE_REACTION_MODE_MAP);
}
