import { REST } from "@discordjs/rest";
import { Client } from "discord.js";
import { config } from "../config/config";
import { CommandList } from "../commands/_CommandList";
import { Routes } from "discord-api-types/v9";

export const onReady = async (client: Client) => {
    const rest = new REST({ version: "9" }).setToken(
        config.TOKEN as string
    );

    const commandData = CommandList.map((command) => command.data.toJSON());

    await rest.put(
        Routes.applicationGuildCommands(
            client.user?.id || "missing id",
            config.GUILD_ID as string
        ),
        { body: commandData }
    );

    console.log("Discord ready");
};