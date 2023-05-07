## Starting the bot
From the root directoy of this project, run `npm start`. You must have set up a bot in discord, some instructions can be found [here](https://discord.com/developers/docs/getting-started). Note that this app will need some discord credentials, which can be set as environment variables or placed in a `.env` folder within this projects root directory. 

## Auto removal
Auto removal from playlists has a default setting of 60 minutes, and warning after 50 minutes. This can be overwritten by setting environment variables `EXPIRE_AFTER_TIME_IN_MINUES` and `WARN_AFTER_TIME_IN_MINUES` respectively (i.e. `export EXPIRE_AFTER_TIME_IN_MINUES=30`). 