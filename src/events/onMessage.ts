import { Message } from "discord.js";
import { CommandList } from "../commands/_CommandList";
import { config } from "../config/config";

export const onMessage = async (message: Message, playlists: { [name: string]: IPlaylist }) => {
    const content = message.content;
    console.log(`New message: ${content}`);

    if (!content.startsWith(config.PREFIX)) {
        return;
    }

    let commandName = message.content.toLowerCase().split(" ")[0].slice(1);
    for (const Command of CommandList) {
        if (commandName === Command.data.name) {
            await Command.runMessage(message, playlists);
        }
    }
};