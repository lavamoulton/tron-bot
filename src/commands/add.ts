import { ICommand } from "../interfaces/Command";
import { SlashCommandBuilder } from "@discordjs/builders";
import { pl } from "../playlists/playlists";

export const add: ICommand = {
    data: new SlashCommandBuilder()
        .setName("add")
        .setDescription("Add to specified playlist(s)")
        .addStringOption((option) =>
            option 
                .setName("playlists")
                .setDescription("Playlists to add to")
                .setChoices(pl.loadChoices())
        ),
    run: async (interaction, playlists) => {
        const { user } = interaction;
        const text = interaction.options.getString("playlists", true);

        let result = pl.addToPlaylist(text, user, playlists);
        await interaction.reply(`${result}`);
    },
    runMessage: async (message, playlists) => {
        const { author } = message;
        const options = message.content.toLowerCase().split(" ").slice(1);

        let result = ``;

        if (options.length === 0) {
            result += pl.addToPlaylist('fort', author, playlists);
            result += pl.addToPlaylist('tst', author, playlists);
            await message.channel.send(`${result}`);
        } else {
            for (let i in options) {
                let option = options[i];
                result += pl.addToPlaylist(option, author, playlists);
            }
            await message.channel.send(`${result}`);
        }
    }
};