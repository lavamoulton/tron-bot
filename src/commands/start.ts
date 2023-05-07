import { ICommand } from "../interfaces/Command";
import { SlashCommandBuilder } from "@discordjs/builders";
import { pl } from "../playlists/playlists";
import { User } from "discord.js";

export const start: ICommand = {
    data: new SlashCommandBuilder()
        .setName("start")
        .setDescription("Start specified playlist(s)")
        .setDefaultPermission(false)
        .addStringOption((option) =>
            option
                .setName("playlists")
                .setDescription("Playlist(s) to start")
                .setChoices(pl.loadChoices())
                .setRequired(true)
        ),
    run: async (interaction, playlists, captains) => {
        const text = interaction.options.getString("playlists", true);

        await pl.fillList(text, interaction.guild!, playlists, captains);
        let result = pl.startPlaylist(text, playlists);
        await interaction.reply(`${result}`);
    },
    runMessage: async (message, playlists, captains) => {
        const options = message.content.toLowerCase().split(" ").slice(1);

        let result = ``;

        if (options.length === 0) {
            await pl.fillList("fort", message.guild!, playlists, captains);
            result += pl.startPlaylist("fort", playlists);
            await message.channel.send(`${result}`);
        } else {
            for (let i in options) {
                let option = options[i];
                await pl.fillList(option, message.guild!, playlists, captains);
                result += pl.startPlaylist(option, playlists);
            }
            await message.channel.send(`${result}`);
        }
    },
};
