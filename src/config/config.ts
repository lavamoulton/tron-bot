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
    EXPIRE_AFTER_TIME_IN_MINUTES: process.env.EXPIRE_AFTER_TIME_IN_MINUTES
        ? parseInt(process.env.EXPIRE_AFTER_TIME_IN_MINUTES, 10)
        : 60,
    WARN_AFTER_TIME_IN_MINUTES: process.env.WARN_AFTER_TIME_IN_MINUTES
        ? parseInt(process.env.WARN_AFTER_TIME_IN_MINUTES, 10)
        : 60,
    DATA_PATH: process.env.DATA_PATH!,
    BUILD_PATH: process.env.BUILD_PATH!,
    LOGGING_LEVEL: process.env.LOGGING_LEVEL
        ? parseInt(process.env.LOGGING_LEVEL, 10)
        : 10,
};

const CLIENT_OPTIONS: ClientOptions = {
    allowedMentions: { users: [], roles: [] },
    caseInsensitiveCommands: true,
    caseInsensitivePrefixes: true,
    defaultPrefix: config.PREFIX,
    intents: [
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
    ],
    loadDefaultErrorListeners: true,
    loadMessageCommandListeners: true,
    logger: {
        level: config.LOGGING_LEVEL,
    },
};

export { config, CLIENT_OPTIONS };
