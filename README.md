# Armagetron Discord Pickup Bot

Discord bot for the Armagetron discord channel to facilitate organized, pickup matches.

## Setup and configuration

After cloning the repository, create a `.env` file based on the provided example. You may also adjust the values in `config.ts` and the `data/` files as needed. Run `npm install` to install the required dependencies. You must have set up a bot in discord, some instructions can be found [here](https://discord.com/developers/docs/getting-started). Note that this app will need some discord credentials, which can be set as environment variables or placed in a `.env` folder within this projects root directory.

### NVM

Consider using node version manager to manage your node.js versions.
Linux/MacOS/WSL: [nvm](https://github.com/nvm-sh/nvm)
Windows: [nvm-windows](https://github.com/coreybutler/nvm-windows)

## Starting the bot

From the root directory, run `npm run build` to build to `dist/` by default. Run `npm run start` to start the bot.

### PM2

Alternatively, you can use a process manager like [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/)

## About the bot

### Sapphire

The source is now using the Sapphire framework. Documentation can be found [here](https://www.sapphirejs.dev/)

### RCL Queue API integration

The `!add` command can push a queue join to the RCL dashboard API.

- Configure:
  - `RCL_API_URL` (example: `https://retrocyclesleague.com`)
  - `RCL_API_KEY` (bot API key shared by dashboard owner)
  - `QUEUE_CHANNEL_POLICIES` (`channelId:scope` CSV, e.g. `123:open,456:beginner,789:pro`)
- Payload sent to `/api/queue/bot/join` includes:
  - `source: "discord:{user_id}"`
  - `username: "{discord_username}"`
  - `playerName: "{discord_username}"` (compatibility field used by current dashboard API)
  - `scope: "open" | "beginner" | "pro"` (resolved from channel policy or panel setup)

Queue scopes are server-enforced by the dashboard API using cached rating data; the bot does not perform live NELG rating lookups per command.

Only supported playlists are forwarded to queue modes:
- `fort` -> `fort`
- `tst`, `tstplacement` -> `tst`
- `sumo`, `sumobar`, `sumobarplacement` -> `sumo`

### @RCL agent — context capture & triage

Mentioning the bot (`@RCL ...`) routes to the dashboard Cursor agent. Authorized
roles can pull recent channel history into the agent's context and reason over
days of conversation:

```
@RCL /agent /capture days=14 /triage
@RCL /capture days=7 what bugs were reported this week?
@RCL /capture hours=12 /triage summarize and propose Linear issues
```

- `/capture` — fetch the current channel transcript over a timeframe and feed it
  to the agent as primary context.
  - Options: `days=N` (default `7`, max `30`), `hours=N`, `limit=N`
    (max messages, default `600`, hard cap `1500`).
  - Transcript is capped (~45k chars); oldest messages are dropped if it overflows.
  - Requires the bot to have **Read Message History** in that channel.
- `/triage` — ask the agent to extract bugs, feature requests, decisions, open
  questions, and action items from the captured transcript, grouped by theme with
  suggested priorities. Implies `/capture` (defaults to a 7-day window) if used
  alone. With Linear write access it dedupes against existing issues and proposes
  (or, when explicitly asked, files) Linear issues.

Directives can be combined with any mode prefix (`/agent`, default ask) and with
free-text instructions.

### Auto removal

Auto removal from playlists has a default setting of 60 minutes, and warning after 50 minutes. This can be overwritten by setting environment variables `EXPIRE_AFTER_TIME_IN_MINUES` and `WARN_AFTER_TIME_IN_MINUES` respectively (i.e. `export EXPIRE_AFTER_TIME_IN_MINUES=30`) or adjusting your `.env`.
