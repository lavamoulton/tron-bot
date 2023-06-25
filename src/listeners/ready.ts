import { Listener, container } from "@sapphire/framework";
import type { Client } from "discord.js";
import { DB } from "../db/db";
import { Manager } from "../core/Manager";

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

        container.db = new DB();
        container.db.createSchema();
        container.manager = new Manager();

        setInterval(async () => {
            container.logger.trace(`Checking for warnings and autoremovals`);
            await container.manager.warnAndExpirePlayers();
        }, 60000);
        setInterval(async () => {
            container.logger.debug(`Updating channel topic`);
            await container.manager.updateTopic();
        }, 300000);

        container.logger.info(`Development logging turned on`);
        container.stores
            .get("listeners")
            .forEach((listener) => container.logger.trace(`Listener: ${listener.name}`));
        container.stores
            .get("commands")
            .forEach((command) => container.logger.trace(`Command: ${command.name}`));
        container.stores
            .get("preconditions")
            .forEach((precondition) =>
                container.logger.trace(`Precondition: ${precondition.name}`)
            );
    }
}
