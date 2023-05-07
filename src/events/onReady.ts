import { REST } from "@discordjs/rest";
import { ApplicationCommandPermissionData, Client } from "discord.js";
import { config } from "../config/config";
import { CommandList } from "../commands/_CommandList";
import { Routes } from "discord-api-types/v9";

export const onReady = async (client: Client) => {
    const rest = new REST({ version: "9" }).setToken(config.TOKEN as string);

    const modPermissions: ApplicationCommandPermissionData[] = [
        {
            id: "708367592049475705",
            type: "ROLE",
            permission: true,
        },
    ];

    const commands = await client.application?.commands.fetch();
    await commands?.forEach((command) => {
        if (command.name === "start") {
            command.permissions.add({
                guild: command.guild!,
                permissions: modPermissions,
            });
        }
    });

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
