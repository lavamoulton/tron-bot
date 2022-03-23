import { ApplicationCommandOptionType, RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v9";
import "jest";
import { pl } from "../../../src/playlists/playlists";
import { getParsedCommand,  runCommand } from "../../helpers/mockInteraction";
import { CommandList } from "../../../src/commands/_CommandList";

const commands = CommandList;

describe('add command', () => {
    test('add interaction', async () => {
        const playlists = pl.loadPlaylists();
        console.log(commands);
        const addCommand = commands.find((command) => {
            return command.data.name.match('add')
        });
        const addCommandData = addCommand?.data.toJSON();
        console.log(addCommandData);
        const stringCommand = '/add playlists: fort';
        if (addCommand) {
            const command = getParsedCommand(stringCommand, addCommandData as RESTPostAPIChatInputApplicationCommandsJSONBody);
            console.log(command);
            const spy = await runCommand(command, addCommandData as RESTPostAPIChatInputApplicationCommandsJSONBody);
            expect(spy).toHaveBeenCalled();
        }
    })
})