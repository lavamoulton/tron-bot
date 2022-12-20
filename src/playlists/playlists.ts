import * as yaml from "js-yaml";
import * as fs from "fs";
import { Playlist } from "./Playlist";
import { Guild, User } from "discord.js";

function loadPlaylists(): IPlaylists {
    const playlists: IPlaylists = {};

    try {
        const pFile: any = yaml.load(fs.readFileSync('./src/playlists/playlists.yml', 'utf8'));
        const pFileLists = pFile.playlists;
        for (let name in pFileLists) {
            playlists[name] = new Playlist(pFileLists[name].name, pFileLists[name].players, pFileLists[name].draft, pFileLists[name].description);
        }
        return playlists;
    } 
    catch (e) {
        console.log(e);
        return {};
    }
}

function loadChoices(): [name: string, value: string][] {
    let result = [];
    let playlists = loadPlaylists();
    for (let i in playlists) {
        let playlist = playlists[i];
        result.push([playlist.name, i] as [name: string, value: string]);
    }
    return result;
}

function addToPlaylist(name: string, user: User, playlists: IPlaylists): string {
    if (playlists[name].addPlayer(user)) {
        if (playlists[name].isFull()) {
            return startPlaylist(name, playlists);
        } else {
            return playlists[name].printList();
        }
    } else {
        return `${user}, you are already added to ${name}!\n`;
    }
}

function removeFromPlaylist(name: string, user: User, playlists: IPlaylists): string {
    if (playlists[name].removePlayer(user)) {
        return playlists[name].printList();
    } else {
        return `${user}, you are not added to ${name}!\n`;
    }
}

function startPlaylist(name: string, playlists: IPlaylists): string {
    let result = `----- ${playlists[name].name} ready to start! -----\n`;
    let playerList = shuffle(Object.keys(playlists[name].list));
    if (playlists[name].draft) {
        console.log(`Player list: ${playerList}`);
        result += `${getDraft(playerList)}\n`;
        clearPlaylists(name, playlists);
        return result;
    }
    if (name === 'tst') {
        result += `${getTST(playerList)}\n`;
        clearPlaylists(name, playlists);
        return result;
    }
    if (name === 'sumobar') {
        result += `${getSumobar(playerList)}\n`;
        clearPlaylists(name, playlists);
        return result;
    }

    return `Playlist could not be started`;
}

function clearPlaylists(name: string, playlists: IPlaylists) {
    let playerList = playlists[name].list;
    for (let i in playerList) {
        let player = playerList[i];
        for (let listName in playlists) {
            let tempList = playlists[listName];
            if (tempList.isPlayerAdded(player)) {
                tempList.removePlayer(player);
            }
        }
    }
    playlists[name].clearList();
}

async function fillList(name: string, guild: Guild, playlists: IPlaylists, captains: string[]): Promise<void> {
    let playlist = playlists[name];
    console.log(`Playlist: ${playlist.players}`);
    let randomUsers = await guild.members.list({ limit: playlist.players });
    while(randomUsers.keys.length > playlist.players) {
        let first = randomUsers.firstKey();
        if (first) {
            randomUsers.delete(first);
        }
    }
    randomUsers.forEach((user) => {
        playlist.list[user.id] = {
            id: user.id,
            displayName: user.displayName,
        }
    });
    /*let randomUsers = guild.members.cache.random(12);
    console.log(`random users: ${randomUsers.length}, ${randomUsers}`);
    for (let i in randomUsers) {
        let user = randomUsers[i];
        playlist.list[user.id] = {
            id: user.id,
            displayName: user.displayName,
        }
    }*/
}

function getDraft(playerList: string[]): string {
    let captain1 = playerList.splice(0, 1);
    let captain2 = playerList.splice(0, 1);
    console.log(`Player list: ${playerList}`);
    let nonCaptains = playerList.map(player => `<@${player}>`);
    console.log(`Non captains: ${nonCaptains}`);
    let result = `Team blue captain <:ddef_blue:869978902855028767>: <@${captain1}>\n` +
                    `Team gold captain <:ddef_gold:869978924795461662>: <@${captain2}>\n` +
                    `Players: ${nonCaptains}`;
    return result;
}

function getTST(playerList: string[]): string {
    let result = `Team purple <:cycle8:736663857300242555>: <@${playerList[0]}>, <@${playerList[1]}>\n` +
                    `Team orange <:cycle7:736663857606557807>: <@${playerList[2]}>, <@${playerList[3]}>\n` +
                    `Team ugly <:cycle6:736663857589649468>: <@${playerList[4]}>, <@${playerList[5]}>\n` +
                    `Team gold <:cycle2:736663849763209227>: <@${playerList[6]}>, <@${playerList[7]}>\n`;
    return result;
}

function getSumobar(playerList: string[]): string {
    let map = playerList.map(player => `<@${playerList[playerList.indexOf(player)]}>`);
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

function shuffle(array: any[]) {
    for(var i = array.length -1; i>0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

function getAddedPlayers(playlists: IPlaylists): string {
    let result = `No players added.`;
    let first = true;
    for (let i in playlists) {
        let playlist = playlists[i];
        if (!playlist.isEmpty()) {
            if (first) {
                result = playlist.printList();
                first = false;
            } else {
                result += playlist.printList();
            }
        }
    }
    return result;
}

function getAddedPlayersAndWhen(playlists: IPlaylists): string {
    let result = `No players added.`;
    let first = true;
    for (let i in playlists) {
        let playlist = playlists[i];
        if (!playlist.isEmpty()) {
            if (first) {
                result = playlist.printDetailedList();
                first = false;
            } else {
                result += playlist.printDetailedList();
            }
        }
    }
    return result;
}

/**
 * 
 * @param playlists Current playlist objects
 * @param empty Displays empty playlists if set to true, otherwise only prints playlists with players added
 * @returns 
 */
function printPlaylists(playlists: IPlaylists, empty: boolean): string {
    let result = `No players added.`;
    let first = true;
    for (let i in playlists) {
        let playlist = playlists[i];
        if (playlist.isEmpty() && !empty) {
            continue;
        }
        if (first) {
            result = playlist.printList();
            first = false;
        } else {
            result += playlist.printList();
        }
    }
    return result;
}

export const pl = {
    loadPlaylists,
    loadChoices,
    startPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    fillList,
    getAddedPlayers,
    printPlaylists,
    getAddedPlayersAndWhen,
}