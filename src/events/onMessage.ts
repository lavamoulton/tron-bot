import { Message } from "discord.js";
import { CommandList } from "../commands/_CommandList";
import { config } from "../config/config";

export const onMessage = async (message: Message, playlists: IPlaylists, captains: string[]) => {
    const content = message.content;
    console.log(`New message: ${content}`);

    if (message.channel.type === "GUILD_TEXT") {
        let channel = message.channel;
        if (channel.name !== 'pickup') {
            return;
        }
    } else {
        return;
    }

    if (!content.startsWith(config.PREFIX)) {
        return;
    }

    let commandName = message.content.toLowerCase().split(" ")[0].slice(1);
    for (const Command of CommandList) {
        if (commandName === Command.data.name) {
            await Command.runMessage(message, playlists, captains);
        }
    }
};