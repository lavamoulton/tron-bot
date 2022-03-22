import { Client, Intents } from "discord.js";
import { onReady } from "../../src/events/onReady";
import { config } from "../../src/config/config";

export default class IntegrationHelpers {

    public static client: Client;

    public static async getClient(): Promise<Client> {
        if (this.client) {
            return this.client;
        }
        const client: Client = new Client({
            intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS]
        });

        return client;
    }
}