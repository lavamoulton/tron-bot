import { Client, Intents } from "discord.js";
import { config } from "./config/config";
import { onInteraction } from "./events/onInteraction";
import { onReady } from "./events/onReady";
import { onMessage } from "./events/onMessage";
import { pl } from "./playlists/playlists";

(async () => {
    const client = new Client({
        intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
    });

    let playlists = pl.loadPlaylists();
    if (!playlists) {
        console.log('Error loading playlists');
        playlists = {};
    }

    client.once("ready", async () => await onReady(client));

    client.on("interactionCreate", async (interaction) => await onInteraction(interaction, playlists));

    client.on("messageCreate", async (message) => await onMessage(message, playlists));

    await client.login(config.TOKEN);
})();