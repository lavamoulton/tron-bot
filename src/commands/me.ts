import { Command, container } from "@sapphire/framework";
import { EmbedBuilder, type Guild, type GuildEmoji, type Message } from "discord.js";
import { getDiscordPlayerProfile, isQueueApiRequestError } from "../core/rclQueueApi";
import { resolveQueueTier, type QueueTier } from "../core/queuePresentation";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "me";
const COMMAND_DESCRIPTION = "Show your RCL pickup profile";
const BRAND_ICON_URL = "https://hub.retrocyclesleague.com/icons/icon-192.png";

const TIER_EMOJI_TERMS: Record<QueueTier, string[]> = {
    bronze: ["bronze"],
    silver: ["silver"],
    gold: ["gold"],
    platinum: ["platinum"],
    diamond: ["diamond"],
    amethyst: ["amethyst", "diamondamethyst", "amethystdiamond", "diamond"],
    master: ["master"],
    grandmaster: ["grandmaster", "grand_master"],
    legend: ["legend"],
};

const TIER_ICON_URL: Record<QueueTier, string> = {
    bronze: "https://hub.retrocyclesleague.com/assets/ranks/bronze.png",
    silver: "https://hub.retrocyclesleague.com/assets/ranks/silver.png",
    gold: "https://hub.retrocyclesleague.com/assets/ranks/gold.png",
    platinum: "https://hub.retrocyclesleague.com/assets/ranks/platinum.png",
    diamond: "https://hub.retrocyclesleague.com/assets/ranks/diamond-master-7.png",
    amethyst: "https://hub.retrocyclesleague.com/assets/ranks/diamond-amethyst-9.png",
    master: "https://hub.retrocyclesleague.com/assets/ranks/master.png",
    grandmaster: "https://hub.retrocyclesleague.com/assets/ranks/grandmaster.png",
    legend: "https://hub.retrocyclesleague.com/assets/ranks/legend.png",
};

const QUEUE_TIERS = new Set<QueueTier>([
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
    "amethyst",
    "master",
    "grandmaster",
    "legend",
]);

type PlayerProfile = Awaited<ReturnType<typeof getDiscordPlayerProfile>>;

function formatNumber(value: number | null | undefined, fallback = "N/A"): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return new Intl.NumberFormat("en-GB").format(value);
}

function formatDecimal(value: number | null | undefined, fallback = "N/A"): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return value.toFixed(value % 1 === 0 ? 0 : 2);
}

function formatDate(value: string | null | undefined): string {
    if (!value) return "No matches yet";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "No matches yet";
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatDelta(value: number | null | undefined): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
    return value > 0 ? `+${value}` : String(value);
}

function normalizeEmojiName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveProfileTier(profile: PlayerProfile): QueueTier | null {
    const tier = String(profile.rating.tier || "").toLowerCase() as QueueTier;
    if (QUEUE_TIERS.has(tier)) return tier;
    return resolveQueueTier(profile.rating.value);
}

function formatRating(profile: PlayerProfile, rankEmoji: string): string {
    const rating = profile.rating.value;
    if (typeof rating !== "number" || !Number.isFinite(rating)) return "No cached rating yet";
    const rank = profile.rating.rankingRank ? `#${profile.rating.rankingRank}` : "unranked";
    const prefix = rankEmoji ? `${rankEmoji} ` : "";
    return `${prefix}${Math.round(rating)} Elo (${rank})`;
}

function formatIdentityLine(profile: PlayerProfile): string {
    const state = profile.verificationState === "verified" ? "linked" : "not linked";
    return `Player: ${profile.playerName} (${state})`;
}

export class MeCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            preconditions: ["Channel"],
        });
    }

    private findBestRankEmoji(
        emojis: GuildEmoji[],
        terms: string[]
    ): GuildEmoji | null {
        let best: GuildEmoji | null = null;
        let bestScore = -1;
        const normalizedTerms = terms.map((term) => normalizeEmojiName(term)).filter(Boolean);
        for (const emoji of emojis) {
            const normalizedName = normalizeEmojiName(emoji.name || "");
            if (!normalizedName) continue;
            for (const term of normalizedTerms) {
                let score = -1;
                if (normalizedName === term) score = 300;
                else if (normalizedName.startsWith(term) || normalizedName.endsWith(term)) score = 200;
                else if (normalizedName.includes(term)) score = 100;
                if (score > bestScore) {
                    bestScore = score;
                    best = emoji;
                }
            }
        }
        return bestScore >= 0 ? best : null;
    }

    private async resolveRankEmoji(guild: Guild | null | undefined, tier: QueueTier | null): Promise<string> {
        if (!guild || !tier) return "";
        if (guild.emojis.cache.size === 0) {
            await guild.emojis.fetch().catch(() => undefined);
        }
        const emoji = this.findBestRankEmoji([...guild.emojis.cache.values()], TIER_EMOJI_TERMS[tier]);
        return emoji ? emoji.toString() : "";
    }

    public async messageRun(message: Message) {
        const { author } = message;
        const content = message.content;

        container.logger.debug(`New !me message from ${author.username}: ${content}`);

        try {
            const profile = await getDiscordPlayerProfile(author.id, author.username);
            const displayName = message.member?.displayName || author.username;
            const tier = resolveProfileTier(profile);
            const rankEmoji = await this.resolveRankEmoji(message.guild, tier);
            const thumbnailUrl = tier ? TIER_ICON_URL[tier] : BRAND_ICON_URL;
            const embed = new EmbedBuilder()
                .setColor(0x22d3ee)
                .setAuthor({
                    name: `${displayName}'s RCL profile`,
                    iconURL: author.displayAvatarURL(),
                })
                .setThumbnail(thumbnailUrl)
                .setDescription(formatIdentityLine(profile))
                .addFields(
                    {
                        name: "Overview",
                        value: [
                            `Total games: **${formatNumber(profile.summary.matchesPlayed)}**`,
                            `Rating: **${formatRating(profile, rankEmoji)}**`,
                            `TST last active: **${profile.modes.tst.lastActive || formatDate(profile.summary.latestMatchAt)}**`,
                        ].join("\n"),
                        inline: false,
                    },
                    {
                        name: "TST Stats",
                        value: [
                            `Games: **${formatNumber(profile.modes.tst.matchesPlayed)}**`,
                            `K/D: **${formatDecimal(profile.modes.tst.kd)}** (${formatNumber(profile.modes.tst.kills)}K / ${formatNumber(profile.modes.tst.deaths)}D)`,
                            `Avg points: **${formatDecimal(profile.modes.tst.avgPoints)}**`,
                            `Avg position: **${formatDecimal(profile.modes.tst.avgPosition)}**`,
                            `Month delta: **${formatDelta(profile.modes.tst.monthDelta)} Elo**`,
                            `Total points: **${formatNumber(profile.modes.tst.totalPoints)}**`,
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "Sumobar Stats",
                        value: [
                            `Games: **${formatNumber(profile.modes.sumobar.matchesPlayed)}**`,
                            "Detailed stats: **coming soon**",
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "Fort Stats",
                        value: [
                            `Games: **${formatNumber(profile.modes.fort.matchesPlayed)}**`,
                            "Detailed stats: **coming soon**",
                        ].join("\n"),
                        inline: true,
                    }
                )
                .setFooter({
                    text: profile.hubStatsReady
                        ? "TST stats from the same Hub leaderboard/history APIs, cached server-side"
                        : "Hub TST stats unavailable; showing available identity data only",
                })
                .setTimestamp();

            if (profile.verificationState !== "verified") {
                embed.addFields({
                    name: "Linking",
                    value: "Use `/auth` to link Discord to your RCL Hub account for full profile stats.",
                    inline: false,
                });
            }

            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            container.logger.warn(`Failed to build !me profile for ${author.username}: ${error}`);
            const detail = isQueueApiRequestError(error) ? ` (${error.message})` : "";
            await message.channel.send(`Could not load your RCL profile right now${detail}.`);
        }
    }
}
