import { Command } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { buildQueuePopSendPayloadForGuild } from "../core/QueueThreadSync";
import type { QueuePopResult } from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "popfort";
const COMMAND_DESCRIPTION = "Post a fake Fortress pop card without changing queue state";
const FORT_REQUIRED_PLAYERS = 12;
const DEFAULT_DISCORD_IDS = [
    "654137519620882438",
    "518611637788475392",
    "361681542399000577",
    "397820413545152524",
    "133766628524425216",
    "696168900567760937",
    "339869517192757250",
    "445298849091944448",
    "1495504300174999614",
] as const;

type FakeFortPlayer = {
    playerName: string;
    sourceServer: string | null;
};

function parseDiscordUserId(token: string | undefined): string | null {
    if (!token) return null;
    const trimmed = token.trim();
    const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
    const normalized = mentionMatch ? mentionMatch[1] : trimmed;
    return /^\d{17,20}$/.test(normalized) ? normalized : null;
}

function uniqueDiscordIds(tokens: string[]): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const token of tokens) {
        const id = parseDiscordUserId(token);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= FORT_REQUIRED_PLAYERS) break;
    }
    return ids;
}

export class PopFortCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Use !popfort [discordId|@mention ...] to post a synthetic Fortress-ready card for UI testing.",
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
        const roleNames = new Set(
            member.roles.cache.map((role) => role.name.trim().toLowerCase())
        );
        return (
            roleNames.has("administrator") ||
            roleNames.has("admin") ||
            roleNames.has("moderator") ||
            roleNames.has("staff")
        );
    }

    private resolveFakePlayers(tokens: string[]): FakeFortPlayer[] {
        const suppliedIds = uniqueDiscordIds(tokens);
        const discordIds = suppliedIds.length > 0 ? suppliedIds : [...DEFAULT_DISCORD_IDS];
        const players: FakeFortPlayer[] = discordIds.slice(0, FORT_REQUIRED_PLAYERS).map((discordId) => ({
            playerName: `fort-${discordId}`,
            sourceServer: `discord:${discordId}`,
        }));

        while (players.length < FORT_REQUIRED_PLAYERS) {
            const index = players.length + 1;
            players.push({
                playerName: `test-fort-player-${index}`,
                sourceServer: null,
            });
        }

        return players;
    }

    private buildFakePop(players: FakeFortPlayer[]): QueuePopResult {
        const teams = [0, 1].map((teamIndex) => {
            const teamPlayers = players.slice(teamIndex * 6, teamIndex * 6 + 6);
            return {
                teamIndex: teamIndex + 1,
                playerNames: teamPlayers.map((player) => player.playerName),
                slots: teamPlayers.map((_, index) => teamIndex * 6 + index + 1),
            };
        });

        return {
            id: `fake-fort-pop-${Date.now()}`,
            mode: "fort",
            scope: "open",
            targetServer: null,
            playerNames: players.map((player) => player.playerName),
            poppedAt: new Date().toISOString(),
            completedAt: null,
            allocationMetadata: {
                fake: true,
                source: "bot-popfort-command",
                playerSources: players.map((player) => ({
                    playerName: player.playerName,
                    sourceServer: player.sourceServer,
                })),
                fortTeams: teams,
            },
        };
    }

    public async messageRun(message: Message) {
        if (!this.isPrivilegedMember(message.member)) {
            await message.channel.send("Only admin/mod/staff can use `!popfort`.");
            return;
        }

        const tokens = message.content
            .split(" ")
            .map((token) => token.trim())
            .filter(Boolean)
            .slice(1);
        const players = this.resolveFakePlayers(tokens);
        const payload = await buildQueuePopSendPayloadForGuild(
            this.buildFakePop(players),
            message.guild
        );

        await message.channel.send(typeof payload === "string" ? payload : payload);
    }
}
