import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "@discordjs/builders";
import { CommandInteraction, Message } from "discord.js";

export interface ICommand {
    data: Omit<SlashCommandBuilder, "addSubcommandGroup" | "addSubcommand"> | SlashCommandSubcommandsOnlyBuilder;
    run: (interaction: CommandInteraction, playlists: { [name: string]: IPlaylist }) => Promise<void>;
    runMessage: (message: Message, playlists: { [name: string]: IPlaylist }) => Promise<void>;
}