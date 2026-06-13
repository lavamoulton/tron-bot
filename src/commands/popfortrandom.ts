import { Command, container } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { fortTierBalancer } from "../core/FortTierBalancer";
import { buildQueuePopSendPayloadForGuild, type PopSendPayload } from "../core/QueueThreadSync";
import { getPlayerDirectorySnapshot, type PlayerDirectoryEntry, type QueuePopResult } from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "popfortrandom";
const COMMAND_DESCRIPTION = "Post a Fort test pop with 12 random Discord-linked players";
const FORT_REQUIRED_PLAYERS = 12;

type RandomFortPlayer = {
    playerName: string;
    sourceServer: string;
};

function shuffle<T>(values: T[]): T[] {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function pickDisplayName(entry: PlayerDirectoryEntry, discordId: string): string {
    return entry.displayName || entry.sourceKey || `discord-${discordId}`;
}

function normalizePlayerKey(value: string | null | undefined): string | null {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/@.*/, "")
        .replace(/[^a-z0-9]+/g, "");
    return normalized || null;
}

function getEntryKeys(entry: PlayerDirectoryEntry, discordId: string): string[] {
    return Array.from(
        new Set(
            [
                entry.id,
                pickDisplayName(entry, discordId),
                entry.displayName,
                entry.sourceKey,
                ...((entry.legacyLogins || []) as string[]),
                fortTierBalancer.getNickname(discordId),
            ]
                .map((value) => normalizePlayerKey(value))
                .filter((value): value is string => Boolean(value))
        )
    );
}

function pickBestDiscordId(discordIds: string[]): string | null {
    const validIds = Array.from(
        new Set(discordIds.map((discordId) => String(discordId || "").trim()).filter((id) => /^\d{17,20}$/.test(id)))
    );
    if (validIds.length === 0) return null;
    return validIds.find((discordId) => fortTierBalancer.hasSheetPlayer(discordId)) || validIds[0];
}

function uniqueDiscordLinkedPlayers(entries: PlayerDirectoryEntry[]): RandomFortPlayer[] {
    const seenDiscordIds = new Set<string>();
    const seenPlayerKeys = new Set<string>();
    const players: RandomFortPlayer[] = [];
    for (const entry of entries) {
        const normalizedId = pickBestDiscordId(entry.discordUserIds || []);
        if (!normalizedId || seenDiscordIds.has(normalizedId)) continue;
        const entryKeys = getEntryKeys(entry, normalizedId);
        if (entryKeys.some((key) => seenPlayerKeys.has(key))) continue;
        seenDiscordIds.add(normalizedId);
        for (const key of entryKeys) seenPlayerKeys.add(key);
        players.push({
            playerName: pickDisplayName(entry, normalizedId),
            sourceServer: `discord:${normalizedId}`,
        });
    }
    return players;
}

function buildRandomFortPop(players: RandomFortPlayer[]): QueuePopResult {
    return {
        id: `random-fort-pop-${Date.now()}`,
        mode: "fort",
        scope: "open",
        targetServer: null,
        playerNames: players.map((player) => player.playerName),
        poppedAt: new Date().toISOString(),
        completedAt: null,
        allocationMetadata: {
            fake: true,
            random: true,
            source: "bot-popfortrandom-command",
            playerSources: players.map((player) => ({
                playerName: player.playerName,
                sourceServer: player.sourceServer,
            })),
        },
    };
}

function addIntro(payload: PopSendPayload, content: string): PopSendPayload {
    if (typeof payload === "string") return `${content}\n${payload}`;
    return {
        ...payload,
        content: payload.content ? `${content}\n${payload.content}` : content,
    };
}

export class PopFortRandomCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Use !popfortrandom to fetch 12 random Discord-linked players from the queue player directory and test Fort balancing.",
            preconditions: ["Channel"],
        });
    }

    private isPrivilegedMember(member: GuildMember | null | undefined): boolean {
        if (!member) return false;
        if (member.id === member.guild.ownerId) return true;
        if (
            member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            member.permissions.has(PermissionFlagsBits.BanMembers)
        ) {
            return true;
        }
        const roleNames = new Set(member.roles.cache.map((role) => role.name.trim().toLowerCase()));
        return (
            roleNames.has("administrator") ||
            roleNames.has("admin") ||
            roleNames.has("moderator") ||
            roleNames.has("staff")
        );
    }

    public async messageRun(message: Message) {
        if (!this.isPrivilegedMember(message.member)) {
            await message.channel.send("Only admin/mod/staff can use `!popfortrandom`.");
            return;
        }

        try {
            const snapshot = await getPlayerDirectorySnapshot();
            await fortTierBalancer.ensureLoaded();
            const candidates = uniqueDiscordLinkedPlayers(snapshot.entries);
            if (candidates.length < FORT_REQUIRED_PLAYERS) {
                await message.channel.send(
                    `Need at least ${FORT_REQUIRED_PLAYERS} Discord-linked players in the database; found ${candidates.length}.`
                );
                return;
            }

            const players = shuffle(candidates).slice(0, FORT_REQUIRED_PLAYERS);
            const payload = await buildQueuePopSendPayloadForGuild(
                buildRandomFortPop(players),
                message.guild,
                { includeFortDiagnostics: true }
            );
            const content = `Random Fort balance test: ${FORT_REQUIRED_PLAYERS} players sampled from ${candidates.length} Discord-linked database entries.`;
            await message.channel.send(addIntro(payload, content));
        } catch (error) {
            container.logger.warn(`Failed random Fort pop test: ${error}`);
            await message.channel.send("Failed to fetch random Discord IDs for Fort balance testing.");
        }
    }
}
