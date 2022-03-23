import { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from "@discordjs/builders";
import { APIApplicationCommandOption, RESTPostAPIApplicationCommandsJSONBody, RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v9";
import { CommandInteraction, ApplicationCommandData } from "discord.js";
import { RawCommandInteractionData } from "discord.js/typings/rawDataTypes";
import { ICommand } from "../../src/interfaces/Command";
import { MockDiscord } from "./mockDiscord";

export function mockInteraction(command: RESTPostAPIChatInputApplicationCommandsJSONBody) {
    const discord = new MockDiscord({ command });
    const interaction = discord.getInteraction() as CommandInteraction;
    const spy = jest.spyOn(interaction, 'reply');
    return { interaction, spy };
}

export async function runCommand(command: ApplicationCommandData, content: RESTPostAPIChatInputApplicationCommandsJSONBody) {
    const { interaction, spy } = mockInteraction(content);
    const commandInstance = new command(interaction);
    await commandInstance.run();
    return spy;
}

// getParsedCommand implementation 
export const optionType = {
    // 0: null,
    // 1: subCommand,
    // 2: subCommandGroup,
    3: String,
    4: Number,
    5: Boolean,
    // 6: user,
    // 7: channel,
    // 8: role,
    // 9: mentionable,
    10: Number,
  }
  
  function castToType(value: string, typeId: number) {
    //@ts-ignore
    const typeCaster = optionType[typeId]
    return typeCaster ? typeCaster(value) : value
  }
  
  export function getParsedCommand(stringCommand: string, commandData: RESTPostAPIChatInputApplicationCommandsJSONBody): CommandInteraction | undefined {
    const options = commandData.options;
    if (!options) {
      return;
    }
    const optionsIndentifiers = options.map(option => `${option.name}:`)
    //@ts-ignore
    const requestedOptions = options.reduce((requestedOptions, option) => {
      const identifier = `${option.name}:`
      if (!stringCommand.includes(identifier)) return requestedOptions
      const remainder = stringCommand.split(identifier)[1]
  
      const nextOptionIdentifier = remainder.split(' ').find(word => optionsIndentifiers.includes(word))
      if (nextOptionIdentifier) {
        const value = remainder.split(nextOptionIdentifier)[0].trim()
        return [...requestedOptions, {
          name: option.name,
          value: castToType(value, option.type),
          type: option.type
        }]
      }
  
      return [...requestedOptions, {
        name: option.name,
        value: castToType(remainder.trim(), option.type),
        type: option.type
      }]
    }, [])
    const optionNames = options.map(option => option.name)
    const splittedCommand = stringCommand.split(' ')
    const name = splittedCommand[0].replace('/', '')
    const subcommand = splittedCommand.find(word => optionNames.includes(word))
    return {
      id: name,
      name,
      type: "APPLICATION_COMMAND",
      //@ts-ignore
      options: subcommand ? [{
        name: subcommand,
        type: 1,
        options: requestedOptions
      }] : requestedOptions
    }
  }
  
  