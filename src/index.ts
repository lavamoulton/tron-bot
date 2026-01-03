import { container } from "@sapphire/framework";
import { config } from "./config/config";
import { TronClient } from "./core/TronClient";
import "@sapphire/plugin-logger/register";

const client = new TronClient();

(async () => {
    try {
        await client.login(config.TOKEN);
        container.logger.info(
            `Sapphire client logged in successfully (id: ${client.id})`
        );
    } catch (error) {
        container.logger.error(error);
    }
})();
