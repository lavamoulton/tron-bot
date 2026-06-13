import { container } from "@sapphire/framework";
import { config } from "../config/config";

type LinkNotification = {
    id: string;
    discordUserId: string;
    profileUsername: string;
    ingameEmail: string;
    createdAt: string;
};

const POLL_INTERVAL_MS = 10_000;

function normalizeApiUrl(url: string): string {
    return url.replace(/\/+$/, "");
}

export class LinkNotificationSync {
    private started = false;
    private tickActive = false;

    public async start(): Promise<void> {
        if (this.started) return;

        if (!config.RCL_API_URL || !config.RCL_API_KEY) {
            container.logger.info("Link notification sync disabled (missing RCL_API_URL/RCL_API_KEY)");
            return;
        }

        this.started = true;
        container.logger.info("Link notification sync enabled");
        await this.tick();
        setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    }

    private async tick(): Promise<void> {
        if (this.tickActive) return;
        this.tickActive = true;
        try {
            await this.pollAndSend();
        } catch (error) {
            container.logger.warn(`Link notification tick failed: ${error}`);
        } finally {
            this.tickActive = false;
        }
    }

    private async pollAndSend(): Promise<void> {
        const baseUrl = normalizeApiUrl(config.RCL_API_URL!);
        const res = await fetch(`${baseUrl}/api/queue/bot/discord/link-notifications?limit=10`, {
            headers: { authorization: `Bearer ${config.RCL_API_KEY}` },
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            container.logger.warn(`Link notification poll HTTP ${res.status}: ${text}`);
            return;
        }

        const json = await res.json();
        const notifications: LinkNotification[] = Array.isArray(json?.notifications) ? json.notifications : [];
        if (notifications.length === 0) return;

        const sentIds: string[] = [];

        for (const notif of notifications) {
            try {
                const user = await container.client.users.fetch(notif.discordUserId);
                await user.send(
                    `Your Discord account has been linked to your RCL profile **${notif.profileUsername}** (\`${notif.ingameEmail}\`).\n\n` +
                    `Queue activity from Discord will now be tied to your verified in-game identity. No further action needed.`
                );
                sentIds.push(notif.id);
                container.logger.info(`Sent link DM to ${notif.discordUserId} (${notif.profileUsername})`);
            } catch (error) {
                container.logger.warn(`Failed to DM ${notif.discordUserId}: ${error}`);
                sentIds.push(notif.id);
            }
        }

        if (sentIds.length > 0) {
            try {
                await fetch(`${baseUrl}/api/queue/bot/discord/link-notifications`, {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${config.RCL_API_KEY}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ ids: sentIds }),
                });
            } catch (error) {
                container.logger.warn(`Failed to ack link notifications: ${error}`);
            }
        }
    }
}
