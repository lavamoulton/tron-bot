import { container } from "@sapphire/framework";
import { config } from "./config/config";
import { pl } from "./playlists/playlists";
import { TronClient } from "./core/TronClient";
import "@sapphire/plugin-logger/register";

const client = new TronClient();

(async () => {
    try {
        await client.login(config.TOKEN);
    } catch (error) {
        container.logger.error(error);
    }
})();
