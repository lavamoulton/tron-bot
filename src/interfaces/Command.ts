import { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "@discordjs/builders";
import { CommandInteraction, Message } from "discord.js";

export interface ICommand {
    data: Omit<SlashCommandBuilder, "addSubcommandGroup" | "addSubcommand"> | SlashCommandSubcommandsOnlyBuilder;
    run: (interaction: CommandInteraction, playlists: IPlaylists, captains: string[]) => Promise<void>;
    runMessage: (message: Message, playlists: IPlaylists, captains: string[]) => Promise<void>;
}