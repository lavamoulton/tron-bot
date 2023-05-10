import * as yaml from "js-yaml";
import * as fs from "fs";
import { getRootData } from "@sapphire/pieces";
import { Playlist } from "../playlists/Playlist";
import { container } from "@sapphire/framework";
import { join } from "node:path";
import { GuildChannel, TextChannel, User } from "discord.js";
import { config } from "../config/config";
import { isGuildBasedChannel } from "@sapphire/discord.js-utilities";

export class Manager {
    playlists: IPlaylists;
    options: string[];
    channel?: TextChannel;
    private rootData = getRootData();
    private dataPath = `data\\`;

    public constructor() {
        this.options = [];
        this.playlists = this.loadPlaylists();
    }

    public addToPlaylists(names: string[], user: User): string {
        let result = ``;
        container.logger.debug(`${user.username} is adding to playlists: ${names}`);
        for (const name of names) {
            const playlist = this.playlists[name];
            if (!playlist) {
                result += `Playlist ${name} not valid.\n`;
                continue;
            }
            container.logger.debug(`Checking playlist ${name}, found ${playlist.name}`);
            if (playlist.players - playlist.getLength() === 1) {
                return this.startPlaylist(playlist);
            } else {
                result += this.addToPlaylist(playlist, user);
            }
        }
        return result;
    }

    public removeAllPlaylists(user: User): string {
        return this.removeFromPlaylists(this.options, user, true);
    }

    public removeFromPlaylists(names: string[], user: User, condensed: boolean): string {
        let result = ``;
        let check = false;
        container.logger.debug(
            `Removing from playlists: ${names}, condensed mode: ${condensed}`
        );
        for (const name of names) {
            const playlist = this.playlists[name];
            if (!playlist) {
                result += `Playlist ${name} not valid.\n`;
                continue;
            }
            container.logger.debug(`Checking playlist ${name}, found ${playlist.name}`);
            const removeResult = this.removeFromPlaylist(playlist, user);
            if (!check && removeResult[0] && condensed) {
                check = true;
                result = removeResult[1];
            } else if (check && !removeResult[0]) {
                continue;
            } else {
                result += removeResult[1];
            }
        }
        if (!check && condensed) {
            return `${user}, you are not added to any playlists!\n`;
        }
        return result;
    }

    public getAddedPlayers(detailed: boolean): string {
        let result = `No players added.`;
        let first = true;
        for (let i in this.playlists) {
            const playlist = this.playlists[i];
            if (!playlist.isEmpty()) {
                if (first) {
                    if (detailed) {
                        result = playlist.printDetailedList();
                    } else {
                        result = playlist.printList();
                    }
                    first = false;
                } else {
                    if (detailed) {
                        result += playlist.printDetailedList();
                    } else {
                        result += playlist.printList();
                    }
                }
            }
        }
        return result;
    }

    public warnAndExpirePlayers(): void {
        let result = ``;
        if (!this.channel) {
            const channel = container.client.channels.cache.get(config.OUTPUT_CHANNEL!);
            if (channel) {
                this.channel = channel as TextChannel;
                container.logger.info(`Setting output channel for autoremoval`);
            } else {
                container.logger.error(`Could not find output channel for autoremoval`);
            }
        } else {
            for (let i in this.playlists) {
                const playlist = this.playlists[i];
                result += playlist.expirePlayers();
            }
            for (let i in this.playlists) {
                const playlist = this.playlists[i];
                result += playlist.warnPlayers();
            }
            if (result.length > 0) {
                this.channel.send(result);
            }
        }
    }

    private addToPlaylist(playlist: IPlaylist, user: User): string {
        if (playlist.addPlayer(user)) {
            return playlist.printList();
        } else {
            return `${user}, you are already added to ${playlist.name}! Refreshing your added at time for auto removal.\n`;
        }
    }

    private removeFromPlaylist(playlist: IPlaylist, user: User): [boolean, string] {
        if (playlist.removePlayer(user)) {
            return [true, playlist.printList()];
        } else {
            return [false, `${user}, you are not added to ${playlist.name}!\n`];
        }
    }

    private loadPlaylists(): IPlaylists {
        const playlists: IPlaylists = {};

        try {
            const path = `${join(this.rootData.root, this.dataPath, "playlists.yml")}`;
            container.logger.debug(`Loading playlists from path: ${path}`);
            const pFile: any = yaml.load(fs.readFileSync(path, "utf8"));
            const pFileLists = pFile.playlists;
            for (let name in pFileLists) {
                playlists[name] = new Playlist(
                    pFileLists[name].name,
                    pFileLists[name].players,
                    pFileLists[name].draft,
                    pFileLists[name].description
                );
                this.options.push(name);
                container.logger.debug(`Created playlist: ${playlists[name].name}
                Players: ${playlists[name].players}
                Draft: ${playlists[name].draft}
                Description: ${playlists[name].description}`);
            }
            return playlists;
        } catch (e) {
            container.logger.error(e);
            return {};
        }
    }

    private startPlaylist(playlist: IPlaylist): string {
        let result = `----- ${playlist.name} ready to start! -----\n`;
        let playerList = this.shuffle(Object.keys(playlist.list));
        if (playlist.draft) {
            console.log(`Player list: ${playerList}`);
            result += `${this.getDraft(playerList)}\n`;
            this.clearPlaylists(playlist);
            return result;
        }
        if (playlist.name === "tst") {
            result += `${this.getTST(playerList)}\n`;
            this.clearPlaylists(playlist);
            return result;
        }
        if (playlist.name === "sumobar") {
            result += `${this.getSumobar(playerList)}\n`;
            this.clearPlaylists(playlist);
            return result;
        }

        return `Playlist could not be started`;
    }

    private shuffle(array: any[]) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    }

    private getDraft(playerList: string[]): string {
        let captain1 = playerList.splice(0, 1);
        let captain2 = playerList.splice(0, 1);
        console.log(`Player list: ${playerList}`);
        let nonCaptains = playerList.map((player) => `<@${player}>`);
        console.log(`Non captains: ${nonCaptains}`);
        let result =
            `Team blue captain <:ddef_blue:869978902855028767>: <@${captain1}>\n` +
            `Team gold captain <:ddef_gold:869978924795461662>: <@${captain2}>\n` +
            `Players: ${nonCaptains}`;
        return result;
    }

    private getTST(playerList: string[]): string {
        let result =
            `Team purple <:cycle8:736663857300242555>: <@${playerList[0]}>, <@${playerList[1]}>\n` +
            `Team orange <:cycle7:736663857606557807>: <@${playerList[2]}>, <@${playerList[3]}>\n` +
            `Team ugly <:cycle6:736663857589649468>: <@${playerList[4]}>, <@${playerList[5]}>\n` +
            `Team gold <:cycle2:736663849763209227>: <@${playerList[6]}>, <@${playerList[7]}>\n`;
        return result;
    }

    private getSumobar(playerList: string[]): string {
        let map = playerList.map(
            (player) => `<@${playerList[playerList.indexOf(player)]}>`
        );
        let first = true;
        let result = ``;
        map.forEach((player) => {
            if (!first) {
                result += `, `;
            } else {
                first = false;
            }
            result += player;
        });
        return `Sumobar: ${result}`;
    }

    private clearPlaylists(playlist: IPlaylist) {
        let playerList = playlist.list;
        for (let i in playerList) {
            let player = playerList[i];
            for (let listName in this.playlists) {
                let tempList = this.playlists[listName];
                if (tempList.isPlayerAdded(player)) {
                    tempList.removePlayer(player);
                }
            }
        }
        playlist.clearList();
    }
}
