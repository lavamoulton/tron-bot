import { Command, container } from "@sapphire/framework";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    type Message,
} from "discord.js";
import { getLiveServers, isQueueApiRequestError, type LiveServerRecord } from "../core/rclQueueApi";

const COMMAND_ENABLED = true;
const COMMAND_NAME = "servers";
const COMMAND_DESCRIPTION = "Live pickup servers with players";
const BRAND_ICON_URL = "https://hub.retrocyclesleague.com/icons/icon-192.png";
const BROWSER_URL = "https://retrocyclesleague.com/tools/servers";
const MAX_BUTTONS = 25;

type ServerFilters = {
    pickup?: boolean;
    rcl?: boolean;
    mode?: string;
    region?: string;
    includeEmpty?: boolean;
};

function parseFilters(content: string): ServerFilters {
    const tokens = content.trim().split(/\s+/).slice(1).map((token) => token.toLowerCase());
    const filters: ServerFilters = { pickup: true };

    for (const token of tokens) {
        if (token === "all") {
            filters.pickup = undefined;
            filters.rcl = undefined;
            continue;
        }
        if (token === "empty" || token === "waiting") {
            filters.includeEmpty = true;
            continue;
        }
        if (token === "pickup") {
            filters.pickup = true;
            continue;
        }
        if (token === "rcl") {
            filters.rcl = true;
            continue;
        }
        if (["tst", "sumo", "fort", "wst"].includes(token)) {
            filters.mode = token;
            continue;
        }
        if (["ny", "eu", "uk", "dc", "au", "hk", "sc", "us"].includes(token)) {
            filters.region = token === "us" ? "ny" : token;
            continue;
        }
    }

    return filters;
}

function modeLabel(mode: string | null): string | null {
    if (!mode || mode === "other") return null;
    if (mode === "sumo") return "SBT";
    return mode.toUpperCase();
}

function formatPlayerCount(server: LiveServerRecord): string {
    if (server.maxPlayers > 0) return `${server.players}/${server.maxPlayers}`;
    return String(server.players);
}

function shortServerName(server: LiveServerRecord): string {
    const mode = modeLabel(server.mode);
    const region = server.region?.toUpperCase() || null;
    if (server.pickup && mode && region) {
        return `Grid ${mode} ${region}`;
    }
    const plain = server.namePlain.trim() || server.connect;
    return plain.length > 42 ? `${plain.slice(0, 39)}…` : plain;
}

function buttonLabel(server: LiveServerRecord): string {
    const base = shortServerName(server);
    const count = formatPlayerCount(server);
    return `${base} (${count})`.slice(0, 80);
}

function connectBrowserUrl(server: LiveServerRecord): string {
    const q = encodeURIComponent(server.connect);
    return `https://retrocyclesleague.com/tools/servers?q=${q}`;
}

function formatServerLine(server: LiveServerRecord): string {
    const name = shortServerName(server);
    const count = formatPlayerCount(server);
    const live = server.probed ? "🟢" : "⚪";
    const players =
        server.playerNames.length > 0
            ? `\n   ↳ ${server.playerNames.slice(0, 6).join(", ")}${server.playerNames.length > 6 ? "…" : ""}`
            : "";
    return `${live} **${name}** — **${count}** · \`${server.connect}\` · [browser](${connectBrowserUrl(server)})${players}`;
}

function chunkLines(lines: string[], maxChars = 950): string[] {
    const chunks: string[] = [];
    let current = "";
    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (current && next.length > maxChars) {
            chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function buildConnectButtons(servers: LiveServerRecord[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const limited = servers.slice(0, MAX_BUTTONS);

    for (let index = 0; index < limited.length; index += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (const server of limited.slice(index, index + 5)) {
            row.addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel(buttonLabel(server))
                    .setURL(connectBrowserUrl(server)),
            );
        }
        rows.push(row);
    }

    return rows;
}

function describeFilters(filters: ServerFilters): string[] {
    const filterBits: string[] = [];
    if (filters.pickup) filterBits.push("pickup");
    if (filters.rcl) filterBits.push("rcl");
    if (filters.mode) filterBits.push(filters.mode);
    if (filters.region) filterBits.push(filters.region.toUpperCase());
    if (!filters.pickup && !filters.rcl) filterBits.push("all servers");
    return filterBits;
}

export class ServersCommand extends Command {
    public constructor(context: Command.Context, options: Command.Options) {
        super(context, {
            ...options,
            enabled: COMMAND_ENABLED,
            name: COMMAND_NAME,
            description: COMMAND_DESCRIPTION,
            detailedDescription:
                "Shows live pickup servers that currently have players. Optional filters: pickup, tst, sumo, fort, ny, uk, au, all (broader list), empty (include waiting servers).",
            preconditions: ["Channel"],
        });
    }

    public async messageRun(message: Message) {
        const filters = parseFilters(message.content);

        try {
            const query: Record<string, string | undefined> = {};
            if (filters.pickup) query.pickup = "1";
            if (filters.rcl) query.rcl = "1";
            if (filters.mode) query.mode = filters.mode;
            if (filters.region) query.region = filters.region;

            const payload = await getLiveServers(query);
            const servers = payload.servers || [];

            if (!payload.ok) {
                await message.channel.send(
                    `Could not load servers${payload.error ? `: ${payload.error}` : "."}`,
                );
                return;
            }

            const active = servers.filter((server) => server.players > 0);
            const waiting = filters.includeEmpty ? servers.filter((server) => server.players <= 0) : [];
            const visible = filters.includeEmpty ? [...active, ...waiting] : active;

            if (visible.length === 0) {
                const filterBits = describeFilters(filters);
                const filterHint = filterBits.length ? ` (${filterBits.join(" · ")})` : "";
                await message.channel.send(
                    [
                        `No servers with players right now${filterHint}.`,
                        "Try again in a bit, or browse the full list: " + BROWSER_URL,
                        filters.includeEmpty ? "" : "Add `empty` to include waiting servers.",
                    ]
                        .filter(Boolean)
                        .join("\n"),
                );
                return;
            }

            const filterBits = describeFilters(filters);

            const embed = new EmbedBuilder()
                .setColor(0x22d3ee)
                .setAuthor({
                    name: "RCL Live Servers",
                    url: BROWSER_URL,
                    iconURL: BRAND_ICON_URL,
                })
                .setDescription(
                    [
                        `**${active.length}** server${active.length === 1 ? "" : "s"} with players` +
                            (filterBits.length ? ` · ${filterBits.join(" · ")}` : ""),
                        `Tap a **Connect** button below, or open the [full browser](${BROWSER_URL}).`,
                    ].join("\n"),
                )
                .setFooter({
                    text: payload.fetchedAt
                        ? `Updated ${new Date(payload.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`
                        : "Live player counts when probed",
                })
                .setTimestamp();

            const activeLines = active.map(formatServerLine);
            const waitingLines = waiting.map(formatServerLine);

            if (activeLines.length > 0) {
                for (const [index, chunk] of chunkLines(activeLines).entries()) {
                    embed.addFields({
                        name: index === 0 ? "Playing now" : "Playing now (cont.)",
                        value: chunk,
                    });
                }
            }

            if (waitingLines.length > 0) {
                for (const [index, chunk] of chunkLines(waitingLines).entries()) {
                    embed.addFields({
                        name: index === 0 ? "Waiting" : "Waiting (cont.)",
                        value: chunk,
                    });
                }
            }

            const components = buildConnectButtons(active);
            await message.channel.send({ embeds: [embed], components });
        } catch (error) {
            container.logger.warn(`Failed to load live servers: ${error}`);
            const detail = isQueueApiRequestError(error) ? error.message : "Unknown error";
            await message.channel.send(`Could not load live servers: ${detail}`);
        }
    }
}
