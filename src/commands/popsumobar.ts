import { Command } from "@sapphire/framework";
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import { buildQueuePopSendPayloadForGuild } from "../core/QueueThreadSync";
import type { QueuePopResult } from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "popsumobar";
const COMMAND_DESCRIPTION = "Post a fake Sumobar pop card without changing queue state";
const SUMOBAR_REQUIRED_PLAYERS = 8;
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

type FakeSumobarPlayer = {
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
        if (ids.length >= SUMOBAR_REQUIRED_PLAYERS) break;
    }
    return ids;
}

export class PopSumobarCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Use !popsumobar [discordId|@mention ...] to post a synthetic Sumobar-ready card for UI testing.",
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

    private resolveFakePlayers(tokens: string[]): FakeSumobarPlayer[] {
        const suppliedIds = uniqueDiscordIds(tokens);
        const discordIds = suppliedIds.length > 0 ? suppliedIds : [...DEFAULT_DISCORD_IDS];
        const players: FakeSumobarPlayer[] = discordIds.slice(0, SUMOBAR_REQUIRED_PLAYERS).map((discordId) => ({
            playerName: `sumobar-${discordId}`,
            sourceServer: `discord:${discordId}`,
        }));

        while (players.length < SUMOBAR_REQUIRED_PLAYERS) {
            const index = players.length + 1;
            players.push({
                playerName: `test-sumobar-player-${index}`,
                sourceServer: null,
            });
        }

        return players;
    }

    private buildFakePop(players: FakeSumobarPlayer[]): QueuePopResult {
        return {
            id: `fake-sumobar-pop-${Date.now()}`,
            mode: "sumo",
            scope: "open",
            targetServer: null,
            playerNames: players.map((player) => player.playerName),
            poppedAt: new Date().toISOString(),
            completedAt: null,
            allocationMetadata: {
                fake: true,
                source: "bot-popsumobar-command",
                playerSources: players.map((player) => ({
                    playerName: player.playerName,
                    sourceServer: player.sourceServer,
                })),
            },
        };
    }

    public async messageRun(message: Message) {
        if (!this.isPrivilegedMember(message.member)) {
            await message.channel.send("Only admin/mod/staff can use `!popsumobar`.");
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
