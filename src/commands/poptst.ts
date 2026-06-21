import { Command } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { buildQueuePopSendPayloadForGuild } from "../core/QueueThreadSync";
import type { QueuePopResult } from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "poptst";
const COMMAND_DESCRIPTION = "Post a fake TST pop card without changing queue state";
const TST_REQUIRED_PLAYERS = 8;
const DEFAULT_DISCORD_IDS = [
    "654137519620882438",
    "518611637788475392",
    "361681542399000577",
    "397820413545152524",
    "133766628524425216",
    "696168900567760937",
    "339869517192757250",
    "445298849091944448",
] as const;
const TEST_RATINGS = [2450, 2350, 2250, 2150, 2050, 1850, 1550, 1350];

type FakeTstPlayer = {
    playerName: string;
    sourceServer: string | null;
    rating: number;
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
        if (ids.length >= TST_REQUIRED_PLAYERS) break;
    }
    return ids;
}

export class PopTstCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Use !poptst [discordId|@mention ...] to post a synthetic TST-ready card for UI testing.",
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

    private resolveFakePlayers(tokens: string[]): FakeTstPlayer[] {
        const suppliedIds = uniqueDiscordIds(tokens);
        const discordIds = suppliedIds.length > 0 ? suppliedIds : [...DEFAULT_DISCORD_IDS];
        const players: FakeTstPlayer[] = discordIds.slice(0, TST_REQUIRED_PLAYERS).map((discordId, index) => ({
            playerName: `tst-${discordId}`,
            sourceServer: `discord:${discordId}`,
            rating: TEST_RATINGS[index] ?? 1800,
        }));

        while (players.length < TST_REQUIRED_PLAYERS) {
            const index = players.length + 1;
            players.push({
                playerName: `test-tst-player-${index}`,
                sourceServer: null,
                rating: TEST_RATINGS[players.length] ?? 1800,
            });
        }

        return players;
    }

    private buildFakePop(players: FakeTstPlayer[]): QueuePopResult {
        const teams = [0, 1, 2, 3].map((teamIndex) => {
            const teamPlayers = players.slice(teamIndex * 2, teamIndex * 2 + 2);
            return {
                teamIndex: teamIndex + 1,
                playerNames: teamPlayers.map((player) => player.playerName),
                ratings: teamPlayers.map((player) => player.rating),
                slots: teamPlayers.map((_, index) => teamIndex * 2 + index + 1),
            };
        });

        return {
            id: `fake-tst-pop-${Date.now()}`,
            mode: "tst",
            scope: "open",
            targetServer: null,
            playerNames: players.map((player) => player.playerName),
            poppedAt: new Date().toISOString(),
            completedAt: null,
            allocationMetadata: {
                fake: true,
                source: "bot-poptst-command",
                playerSources: players.map((player) => ({
                    playerName: player.playerName,
                    sourceServer: player.sourceServer,
                })),
                tstTeams: teams,
            },
        };
    }

    public async messageRun(message: Message) {
        if (!this.isPrivilegedMember(message.member)) {
            await message.channel.send("Only admin/mod/staff can use `!poptst`.");
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
