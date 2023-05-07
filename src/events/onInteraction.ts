import { Interaction } from "discord.js";
import { CommandList } from "../commands/_CommandList";
import { IPlaylists } from "../playlists";

export const onInteraction = async (interaction: Interaction, playlists: IPlaylists, captains: string[]) => {
    if (interaction.isCommand()) {
        for (const Command of CommandList) {
            if (interaction.commandName === Command.data.name) {
                try {
                    await Command.run(interaction, playlists, captains);
                    break;
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }
};