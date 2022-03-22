import { Client, Intents } from "discord.js";
import { config } from "./config/config";
import { onInteraction } from "./events/onInteraction";
import { onReady } from "./events/onReady";
import { onMessage } from "./events/onMessage";
import { pl } from "./playlists/playlists";
import { loadCaptains } from "./captains/captains";

(async () => {
    const client = new Client({
        intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS]
    });

    let playlists = pl.loadPlaylists();
    /*if (!playlists) {
        console.log('Error loading playlists');
        playlists = {};
    }*/

    let captains = loadCaptains();

    client.once("ready", async () => await onReady(client));

    client.on("interactionCreate", async (interaction) => await onInteraction(interaction, playlists, captains));

    client.on("messageCreate", async (message) => await onMessage(message, playlists, captains));

    await client.login(config.TOKEN);
})();