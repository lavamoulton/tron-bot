import { Command } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { buildQueuePopSendPayloadForGuild } from "../core/QueueThreadSync";
import type { QueuePopResult } from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "fakepop";
const COMMAND_DESCRIPTION = "Post a fake TST pop card without changing queue state";
const TEST_RATINGS = [2450, 2350, 2250, 2150, 2050, 1850, 1550, 1350];

type FakePopPlayer = {
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

export class FakePopCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Use !fakepop [discordId|@mention ...] to post a synthetic TST-ready card for UI testing.",
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

    private async resolveFakePlayers(message: Message, tokens: string[]): Promise<FakePopPlayer[]> {
        const seenDiscordIds = new Set<string>();
        const players: FakePopPlayer[] = [];

        for (const token of tokens) {
            if (players.length >= 8) break;
            const discordId = parseDiscordUserId(token);
            if (!discordId || seenDiscordIds.has(discordId)) continue;
            seenDiscordIds.add(discordId);
            players.push({
                playerName: `fake-${discordId}`,
                sourceServer: `discord:${discordId}`,
                rating: TEST_RATINGS[players.length] ?? 1800,
            });
        }

        while (players.length < 8) {
            const index = players.length + 1;
            players.push({
                playerName: `test-player-${index}`,
                sourceServer: null,
                rating: TEST_RATINGS[players.length] ?? 1800,
            });
        }

        return players;
    }

    private buildFakePop(players: FakePopPlayer[]): QueuePopResult {
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
            id: `fake-pop-${Date.now()}`,
            mode: "tst",
            scope: "open",
            targetServer: null,
            playerNames: players.map((player) => player.playerName),
            poppedAt: new Date().toISOString(),
            completedAt: null,
            allocationMetadata: {
                fake: true,
                source: "bot-fakepop-command",
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
            await message.channel.send("Only admin/mod/staff can use `!fakepop`.");
            return;
        }

        const tokens = message.content
            .split(" ")
            .map((token) => token.trim())
            .filter(Boolean)
            .slice(1);
        const players = await this.resolveFakePlayers(message, tokens);
        const payload = await buildQueuePopSendPayloadForGuild(
            this.buildFakePop(players),
            message.guild
        );

        await message.channel.send(typeof payload === "string" ? payload : payload);
    }
}
