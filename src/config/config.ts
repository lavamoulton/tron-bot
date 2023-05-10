import { LogLevel } from "@sapphire/framework";
import { ClientOptions, GatewayIntentBits } from "discord.js";
import "dotenv/config";

const ENVIRONMENT = process.env.environment;

let config = {
    TOKEN: ENVIRONMENT === "development" ? process.env.TOKEN_DEV : process.env.TOKEN,
    CLIENT_ID:
        ENVIRONMENT === "development" ? process.env.CLIENT_ID_DEV : process.env.CLIENT_ID,
    GUILD_ID:
        ENVIRONMENT === "development" ? process.env.GUILD_ID_DEV : process.env.GUILD_ID,
    ENVIRONMENT: ENVIRONMENT,
    INTENT_OPTIONS: ["GUILDS"],
    PREFIX: "!",
    ALLOWED_CHANNELS: ["bot-experiments", "pickup"],
    OUTPUT_CHANNEL:
        ENVIRONMENT === "development"
            ? process.env.OUTPUT_CHANNEL_DEV_ID
            : process.env.OUTPUT_CHANNEL_ID,
};

const CLIENT_OPTIONS: ClientOptions = {
    allowedMentions: { users: [], roles: [] },
    caseInsensitiveCommands: true,
    caseInsensitivePrefixes: true,
    defaultPrefix: config.PREFIX,
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    loadDefaultErrorListeners: true,
    loadMessageCommandListeners: true,
    logger: {
        level: config.ENVIRONMENT === "development" ? LogLevel.Debug : LogLevel.Info,
    },
};

export { config, CLIENT_OPTIONS };
