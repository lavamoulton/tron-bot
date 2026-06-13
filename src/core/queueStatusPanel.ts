import { EmbedBuilder, type Client, type Guild } from "discord.js";
import type { QueueScope } from "../config/config";
import { getQueueModeState } from "./rclQueueApi";
import {
    formatQueuePlayers,
    queueModeCardTitle,
    type QueueCanonicalMode,
    QUEUE_SCOPE_THEME,
} from "./queuePresentation";
import {
    getQueueReactionPanelForChannelScope,
    getQueueReactionPanels,
    setQueueReactionPanelState,
} from "./queueReactionPanel";

type EditableMessage = {
    id: string;
    edit: (options: { embeds: EmbedBuilder[] }) => Promise<unknown>;
    delete?: () => Promise<unknown>;
};

type QueuePanelChannel = {
    id: string;
    send: (options: { embeds: EmbedBuilder[] }) => Promise<EditableMessage>;
    messages: {
        fetch: (messageIdOrOptions: string | { limit: number }) => Promise<unknown>;
    };
};

type QueuePanelCard = {
    mode: QueueCanonicalMode;
    countText: string;
    playersText: string;
};

const PANEL_MODE_ORDER: QueueCanonicalMode[] = ["fort", "tst", "sumo", "wst", "ctf4v4", "4tf"];
const PANEL_DUPLICATE_SCAN_LIMIT = 30;
const panelUpdateLocks = new Map<string, Promise<void>>();

function panelTitleForScope(scope: QueueScope): string {
    const scopeTheme = QUEUE_SCOPE_THEME[scope];
    return `RCL Pickup • ${scopeTheme.label}`;
}

async function withPanelUpdateLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const currentLock = panelUpdateLocks.get(key);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const lockPromise = (currentLock || Promise.resolve()).then(() => gate);
    panelUpdateLocks.set(key, lockPromise);
    if (currentLock) {
        await currentLock;
    }
    try {
        return await work();
    } finally {
        release();
        if (panelUpdateLocks.get(key) === lockPromise) {
            panelUpdateLocks.delete(key);
        }
    }
}

function resolvePanelModes(scope: QueueScope): QueueCanonicalMode[] {
    return PANEL_MODE_ORDER.filter(
        (mode) => scope === "open" || (mode !== "fort" && mode !== "wst" && mode !== "ctf4v4" && mode !== "4tf")
    );
}

async function loadQueuePanelCards(
    scope: QueueScope,
    guild: Guild | null | undefined
): Promise<QueuePanelCard[]> {
    const modes = resolvePanelModes(scope);
    return Promise.all(
        modes.map(async (mode): Promise<QueuePanelCard> => {
            try {
                const queueState = await getQueueModeState(mode, scope);
                return {
                    mode,
                    countText: `${queueState.mode.currentCount}/${queueState.mode.requiredCount}`,
                    playersText: formatQueuePlayers(queueState.mode.entries, {
                        guild,
                        maxPlayers: queueState.mode.requiredCount,
                    }),
                };
            } catch {
                return {
                    mode,
                    countText: "Unavailable",
                    playersText: "_Unavailable_",
                };
            }
        })
    );
}

async function buildQueuePanelEmbed(
    scope: QueueScope,
    guild: Guild | null | undefined
): Promise<EmbedBuilder> {
    const scopeTheme = QUEUE_SCOPE_THEME[scope];
    const cards = await loadQueuePanelCards(scope, guild);
    return new EmbedBuilder()
        .setColor(scopeTheme.color)
        .setTitle(panelTitleForScope(scope))
        .setDescription("Live queue status")
        .addFields(
            ...cards.map((card) => ({
                name: `${queueModeCardTitle(card.mode)} • ${card.countText}`,
                value: card.playersText,
                inline: false,
            }))
        )
        .setTimestamp();
}

function isQueuePanelChannel(value: unknown): value is QueuePanelChannel {
    if (!value || typeof value !== "object") return false;
    const channel = value as QueuePanelChannel;
    return (
        typeof channel.id === "string" &&
        typeof channel.send === "function" &&
        typeof channel.messages?.fetch === "function"
    );
}

async function removeDuplicateQueuePanels(
    channel: QueuePanelChannel,
    scope: QueueScope,
    keepMessageId: string
): Promise<void> {
    const panelTitle = panelTitleForScope(scope);
    const recentMessages = (await channel.messages
        .fetch({ limit: PANEL_DUPLICATE_SCAN_LIMIT })
        .catch(() => null)) as any;
    if (!recentMessages || typeof recentMessages.values !== "function") return;

    const botUserId = (channel as any)?.client?.user?.id;
    for (const message of recentMessages.values()) {
        if (!message || message.id === keepMessageId) continue;
        const embedTitle = message?.embeds?.[0]?.title;
        if (embedTitle !== panelTitle) continue;
        if (botUserId && message?.author?.id !== botUserId) continue;
        if (!botUserId && !message?.author?.bot) continue;
        if (typeof message.delete !== "function") continue;
        await message.delete().catch(() => undefined);
    }
}

export async function upsertQueueStatusPanel(
    channel: QueuePanelChannel,
    scope: QueueScope,
    guild: Guild | null | undefined,
    options?: { bumpToBottom?: boolean }
): Promise<void> {
    const panelKey = `${channel.id}:${scope}`;
    await withPanelUpdateLock(panelKey, async () => {
        const embed = await buildQueuePanelEmbed(scope, guild);
        const bumpToBottom = !!options?.bumpToBottom;
        const existingPanel = getQueueReactionPanelForChannelScope(channel.id, scope);

        if (existingPanel) {
            const existingMessage = (await channel.messages
                .fetch(existingPanel.messageId)
                .catch(() => null)) as EditableMessage | null;
            if (existingMessage) {
                if (bumpToBottom) {
                    const latestMessageCollection = (await channel.messages
                        .fetch({ limit: 1 })
                        .catch(() => null)) as
                        | { first?: () => { id?: string } | undefined }
                        | null;
                    const latestMessageId = latestMessageCollection?.first?.()?.id;
                    const alreadyBottom = latestMessageId === existingMessage.id;
                    if (!alreadyBottom) {
                        const replacementMessage = await channel.send({ embeds: [embed] });
                        setQueueReactionPanelState({
                            channelId: channel.id,
                            messageId: replacementMessage.id,
                            scope,
                        });
                        if (typeof existingMessage.delete === "function") {
                            await existingMessage.delete().catch(() => undefined);
                        }
                        await removeDuplicateQueuePanels(channel, scope, replacementMessage.id);
                        return;
                    }
                }
                await existingMessage.edit({ embeds: [embed] });
                if (bumpToBottom) {
                    await removeDuplicateQueuePanels(channel, scope, existingMessage.id);
                }
                return;
            }
        }

        const panelMessage = await channel.send({ embeds: [embed] });
        setQueueReactionPanelState({
            channelId: channel.id,
            messageId: panelMessage.id,
            scope,
        });
        if (bumpToBottom) {
            await removeDuplicateQueuePanels(channel, scope, panelMessage.id);
        }
    });
}

export async function refreshQueueStatusPanels(
    client: Client,
    options?: { bumpToBottom?: boolean }
): Promise<void> {
    const panels = getQueueReactionPanels();
    for (const panel of panels) {
        const rawChannel = await client.channels.fetch(panel.channelId).catch(() => null);
        if (!isQueuePanelChannel(rawChannel)) continue;
        const guild =
            rawChannel && "guild" in rawChannel ? ((rawChannel as any).guild as Guild | null | undefined) : null;
        await upsertQueueStatusPanel(rawChannel, panel.scope, guild, {
            bumpToBottom: !!options?.bumpToBottom,
        });
    }
}
