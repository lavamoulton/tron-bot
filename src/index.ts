import { SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits } from "discord.js";
import { config } from "./config/config";
import { onInteraction } from "./events/onInteraction";
import { onReady } from "./events/onReady";
import { onMessage } from "./events/onMessage";
import { pl } from "./playlists/playlists";
import { loadCaptains } from "./captains/captains";

(async () => {
    const channel = config.OUTPUT_CHANNEL;

    const client = new SapphireClient({
        intents: [
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
        ],
        loadMessageCommandListeners: true,
    });

    const playlists: IPlaylists = pl.loadPlaylists();

    client.

    await client.login(config.TOKEN);
})();

/*
(async () => {
    let channel = config.OUTPUT_CHANNEL;

    const client = new Client({
        intents: [
            Intents.FLAGS.GUILDS,
            Intents.FLAGS.GUILD_MESSAGES,
            Intents.FLAGS.GUILD_MEMBERS,
        ],
    });

    let playlists: IPlaylists = pl.loadPlaylists();
    let captains = loadCaptains();

    client.once("ready", async () => {
        await onReady(client);
        setInterval(() => {
            Object.values(playlists).forEach((playlist: IPlaylist) =>
                playlist.warnAndExpirePlayers(channel)
            );
        }, 60000);
    });

    client.on(
        "interactionCreate",
        async (interaction) => await onInteraction(interaction, playlists, captains)
    );

    client.on("messageCreate", async (message) => {
        await onMessage(message, playlists, captains);
    });

    await client.login(config.TOKEN);
})();*/
