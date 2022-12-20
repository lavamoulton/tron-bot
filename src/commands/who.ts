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

export const whowhen: ICommand = {
    data: new SlashCommandBuilder()
        .setName("whowhen")
        .setDescription("Display who is added and when"),
    run: async (interaction, playlists) => {
        const { user } = interaction;

        let result = pl.getAddedPlayersAndWhen(playlists);
        await interaction.reply(`${result}`);
    },
    runMessage: async (message, playlists) => {
        let result = pl.getAddedPlayersAndWhen(playlists);
        await message.channel.send(`${result}`);
    }
};