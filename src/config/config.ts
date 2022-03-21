import 'dotenv/config'

let config = {
    TOKEN: process.env.TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    ENVIRONMENT: process.env.environment,
    INTENT_OPTIONS: ["GUILDS"],
    PREFIX: '!',
}

export { config };