import { Listener, container } from "@sapphire/framework";
import type { Client } from "discord.js";
import { QueueThreadSync } from "../core/QueueThreadSync";
import { LinkNotificationSync } from "../core/LinkNotificationSync";
import { PopDmSync } from "../core/PopDmSync";
import { playerDirectoryCache } from "../core/PlayerDirectoryCache";
import {
    clearQueueReactionPanelState,
    getQueueReactionPanels,
} from "../core/queueReactionPanel";

export class ReadyListener extends Listener {
    public constructor(context: Listener.Context, options: Listener.Options) {
        super(context, {
            ...options,
            once: true,
            event: "ready",
        });
    }

    public async run(client: Client) {
        const { username, id } = client.user!;
        const queueThreadSync = new QueueThreadSync();
        const linkNotificationSync = new LinkNotificationSync();
        const popDmSync = new PopDmSync();
        container.logger.info(`Successfully logged in as ${username} (${id})`);
        setInterval(async () => {
            container.logger.debug(`Checking for warnings and autoremovals`);
            await container.manager.warnAndExpirePlayers();
        }, 60000);
        await container.manager.updateTopic();
        setInterval(async () => {
            container.logger.debug(`Updating channel topic`);
            await container.manager.updateTopic();
        }, 300000);
        await playerDirectoryCache.start();
        await queueThreadSync.start();
        await linkNotificationSync.start();
        await popDmSync.start();

        const retiredPanels = getQueueReactionPanels();
        if (retiredPanels.length > 0) {
            for (const panel of retiredPanels) {
                try {
                    const rawChannel = await client.channels.fetch(panel.channelId).catch(() => null);
                    if (!rawChannel || !("messages" in rawChannel)) continue;
                    const panelMessage = await (rawChannel as any).messages
                        .fetch(panel.messageId)
                        .catch(() => null);
                    if (panelMessage && typeof panelMessage.delete === "function") {
                        await panelMessage.delete().catch(() => undefined);
                    }
                } catch (error) {
                    container.logger.warn(
                        `Failed retiring legacy queue panel ${panel.channelId}/${panel.messageId}: ${error}`
                    );
                }
            }
            clearQueueReactionPanelState();
            container.logger.info(
                `Retired legacy queue status panels (${retiredPanels.length} tracked message(s)).`
            );
        }

        container.logger.debug(`Development logging turned on`);
        container.stores
            .get("listeners")
            .forEach((listener) => container.logger.debug(`Listener: ${listener.name}`));
        container.stores
            .get("commands")
            .forEach((command) => container.logger.debug(`Command: ${command.name}`));
        container.stores
            .get("preconditions")
            .forEach((precondition) =>
                container.logger.debug(`Precondition: ${precondition.name}`)
            );
    }
}
