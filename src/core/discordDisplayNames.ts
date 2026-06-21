import type { Client, Guild, GuildMember } from "discord.js";

export type QueuePlayerSource = {
    playerName: string;
    sourceServer: string | null | undefined;
};

function memberDisplayName(member: GuildMember): string {
    return member.displayName || member.user.username;
}

export function parseDiscordUserIdFromSource(sourceServer: string | null | undefined): string | null {
    if (!sourceServer) return null;
    const raw = String(sourceServer).trim();
    const match = raw.match(/discord:([0-9]{17,20})/i);
    return match ? match[1] : null;
}

export async function resolveDiscordDisplayNames(
    guild: Guild | null | undefined,
    client: Client,
    userIds: string[]
): Promise<Map<string, string>> {
    const uniqueIds = Array.from(
        new Set(userIds.map((id) => String(id || "").trim()).filter((id) => /^\d{17,20}$/.test(id)))
    );
    const displayNames = new Map<string, string>();
    if (uniqueIds.length === 0) return displayNames;

    for (const userId of uniqueIds) {
        if (displayNames.has(userId)) continue;
        if (guild) {
            try {
                const member = await guild.members.fetch(userId);
                if (member) {
                    displayNames.set(userId, memberDisplayName(member));
                    continue;
                }
            } catch {
                // Ignore and fall through to global user lookup.
            }
        }
        try {
            const user = await client.users.fetch(userId);
            if (user) {
                displayNames.set(userId, user.username);
            }
        } catch {
            // Ignore unresolved ids.
        }
    }

    return displayNames;
}

export function resolvePlayerDiscordIdsBySource(
    playerSources: QueuePlayerSource[]
): Map<string, string> {
    const byPlayerName = new Map<string, string>();
    for (const source of playerSources) {
        const playerName = String(source.playerName || "").trim();
        if (!playerName || byPlayerName.has(playerName)) continue;
        const userId = parseDiscordUserIdFromSource(source.sourceServer);
        if (!userId) continue;
        byPlayerName.set(playerName, userId);
    }
    return byPlayerName;
}

export async function resolvePlayerDisplayNamesBySource(
    guild: Guild | null | undefined,
    client: Client,
    playerSources: QueuePlayerSource[]
): Promise<Map<string, string>> {
    const playerToDiscordId = resolvePlayerDiscordIdsBySource(playerSources);

    const byId = await resolveDiscordDisplayNames(guild, client, [...playerToDiscordId.values()]);
    const byPlayerName = new Map<string, string>();
    for (const [playerName, userId] of playerToDiscordId.entries()) {
        const displayName = byId.get(userId);
        if (displayName) byPlayerName.set(playerName, displayName);
    }
    return byPlayerName;
}
