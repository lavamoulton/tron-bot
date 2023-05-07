import { ICommand } from "../interfaces/Command";
import { SlashCommandBuilder } from "@discordjs/builders";
import { pl } from "../playlists/playlists";

export const remove: ICommand = {
    data: new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove from specified playlist(s)")
        .addStringOption((option) =>
            option
                .setName("playlists")
                .setDescription("Playlists to remove from")
                .setChoices(pl.loadChoices())
                .setRequired(true)
        ),
    run: async (interaction, playlists) => {
        const { user } = interaction;
        const text = interaction.options.getString("playlists", true);

        let result = pl.removeFromPlaylist(text, user, playlists);
        await interaction.reply(`${result}`);
    },
    runMessage: async (message, playlists) => {
        const { author } = message;
        const options = message.content.toLowerCase().split(" ").slice(1);

        let result = ``;

        if (options.length === 0) {
            for (let i in playlists) {
                pl.removeFromPlaylist(i, author, playlists);
            }
            await message.channel.send(`${pl.printPlaylists(playlists, false)}`);
        } else {
            for (let i in options) {
                let option = options[i];
                if (option in playlists) {
                    result += pl.removeFromPlaylist(option, author, playlists);
                }
            }
            await message.channel.send(`${result}`);
        }
    },
};
