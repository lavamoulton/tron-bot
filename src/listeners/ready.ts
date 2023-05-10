import { Listener, container } from "@sapphire/framework";
import type { Client } from "discord.js";

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
        container.logger.info(`Successfully logged in as ${username} (${id})`);
        setInterval(() => {
            container.logger.debug(`Checking for warnings and autoremovals`);
            container.manager.warnAndExpirePlayers();
        }, 60000);

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
