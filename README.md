## Setup and configuration

After cloning the repository, create a `.env` file based on the provided example. You may also adjust the values in `config.ts` and the `data/` files as needed. Run `npm install` to install the required dependencies. You must have set up a bot in discord, some instructions can be found [here](https://discord.com/developers/docs/getting-started). Note that this app will need some discord credentials, which can be set as environment variables or placed in a `.env` folder within this projects root directory.

## Starting the bot

From the root directory, run `npm run build` to build to `dist/` by default. Run `npm run start` to start the bot.

## Auto removal

Auto removal from playlists has a default setting of 60 minutes, and warning after 50 minutes. This can be overwritten by setting environment variables `EXPIRE_AFTER_TIME_IN_MINUES` and `WARN_AFTER_TIME_IN_MINUES` respectively (i.e. `export EXPIRE_AFTER_TIME_IN_MINUES=30`) or adjusting your `.env`.

## Adding / editing playlists

To add a new playlist or edit the settings of an existing playlist, edit `playlists.yml`, following the format of the existing entries. These will automatically be loaded in after restarting the bot.
