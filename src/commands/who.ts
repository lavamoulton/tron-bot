import { ICommand } from "../interfaces/Command";
import { SlashCommandBuilder } from "@discordjs/builders";
import { pl } from "../playlists/playlists";

export const who: ICommand = {
    data: new SlashCommandBuilder()
        .setName("who")
        .setDescription("Display who is added"),
    run: async (interaction, playlists) => {
        const { user } = interaction;

        let result = pl.getAddedPlayers(playlists);
        await interaction.reply(`${result}`);
    },
    runMessage: async (message, playlists) => {
        let result = pl.getAddedPlayers(playlists);
        await message.channel.send(`${result}`);
    }
};