import { container } from "@sapphire/framework";
import { config } from "../config/config";

type PendingPopDm = {
    id: string;
    mode: string;
    targetServer: string;
    targetServerName?: string | null;
    poppedAt: string;
    playerNames: string[];
    discordUserIds: string[];
    playerTargets?: Array<{
        playerName: string;
        discordUserId: string;
        targetServer: string;
        targetServerName?: string | null;
        groupTargetServer?: string;
        groupTargetServerName?: string | null;
    }>;
};

const POLL_INTERVAL_MS = 8_000;

function normalizeApiUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

function formatPopDmMessage(
    discordId: string,
    mode: string,
    targetServer: string,
    targetServerName?: string | null
): string {
    const modeLabel = mode.toUpperCase();
    const connect = targetServer.trim();
    const label = String(targetServerName || "").trim();
    const serverLines =
        label && label !== connect ? `${label}\n\`${connect}\`` : connect ? `\`${connect}\`` : "see pickup channel";
    return (
        `<@${discordId}> :rotating_light: **RCL queue pop – ${modeLabel}**\n\n` +
        `Your game is ready. Join the server:\n**${serverLines}**\n\n` +
        `See you on the grid.`
    );
}

export class PopDmSync {
    private started = false;
    private tickActive = false;

    public async start(): Promise<void> {
        if (this.started) return;

        if (!config.RCL_API_URL || !config.RCL_API_KEY) {
            container.logger.info("Pop DM sync disabled (missing RCL_API_URL/RCL_API_KEY)");
            return;
        }

        this.started = true;
        container.logger.info("Pop DM sync enabled");
        await this.tick();
        setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    }

    private async tick(): Promise<void> {
        if (this.tickActive) return;
        this.tickActive = true;
        try {
            await this.pollAndSend();
        } catch (error) {
            container.logger.warn(`Pop DM sync tick failed: ${error}`);
        } finally {
            this.tickActive = false;
        }
    }

    private async pollAndSend(): Promise<void> {
        const baseUrl = normalizeApiUrl(config.RCL_API_URL!);
        const res = await fetch(
            `${baseUrl}/api/queue/bot/pops/pending-dms?limit=10&maxAgeMinutes=1440`,
            { headers: { authorization: `Bearer ${config.RCL_API_KEY}` } }
        );

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            container.logger.warn(`Pop DM poll HTTP ${res.status}: ${text}`);
            return;
        }

        const json = await res.json();
        const pops: PendingPopDm[] = Array.isArray(json?.pops) ? json.pops : [];
        if (pops.length === 0) return;

        const ackedPopIds: string[] = [];

        for (const pop of pops) {
            const playerTargets =
                Array.isArray(pop.playerTargets) && pop.playerTargets.length > 0
                    ? pop.playerTargets
                    : (Array.isArray(pop.discordUserIds) ? pop.discordUserIds : [])
                          .filter((id): id is string => typeof id === "string")
                          .map((discordId) => ({
                              discordUserId: discordId,
                              playerName: "",
                              targetServer: pop.targetServer ?? "",
                              targetServerName: pop.targetServerName,
                          }));

            for (const target of playerTargets) {
                const discordId = target.discordUserId;
                if (!discordId) continue;
                const message = formatPopDmMessage(
                    discordId,
                    pop.mode,
                    target.targetServer ?? pop.targetServer ?? "",
                    target.targetServerName ?? pop.targetServerName
                );
                try {
                    const user = await container.client.users.fetch(discordId);
                    await user.send({ content: message, allowedMentions: { users: [discordId] } });
                    container.logger.info(`Sent pop DM to ${discordId} for ${pop.mode} pop ${pop.id}`);
                } catch (error) {
                    container.logger.warn(`Failed to send pop DM to ${discordId}: ${error}`);
                }
            }

            ackedPopIds.push(pop.id);
        }

        if (ackedPopIds.length > 0) {
            try {
                const ackRes = await fetch(`${baseUrl}/api/queue/bot/pops/ack-dms`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${config.RCL_API_KEY}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ popIds: ackedPopIds }),
                });
                if (!ackRes.ok) {
                    container.logger.warn(`Pop DM ack HTTP ${ackRes.status}: ${await ackRes.text().catch(() => "")}`);
                }
            } catch (error) {
                container.logger.warn(`Failed to ack pop DMs: ${error}`);
            }
        }
    }
}
