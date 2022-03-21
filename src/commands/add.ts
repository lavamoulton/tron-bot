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
                .setRequired(true)
        ),
    run: async (interaction, playlists) => {
        const { user } = interaction;
        const text = interaction.options.getString("playlists", true);

        if (playlists[text].addPlayer(user)) {
            await interaction.reply(`Adding ${user} to ${text}! \n${pl.printPlaylists(playlists, false)}`);
        } else {
            await interaction.reply(`You are already added to ${text}`);
        }        
    },
    runMessage: async (message, playlists) => {
        const { author } = message;
        const options = message.content.toLowerCase().split(" ").slice(1);

        if (playlists[options[0]].addPlayer(author)) {
            await message.reply(`Adding ${author} to ${options[0]}! \n${pl.printPlaylists(playlists, false)}`);
        } else {
            await message.reply(`Could not add to specified playlist`);
        }
    }
};