import * as yaml from "js-yaml";
import * as fs from "fs";
import { Playlist } from "./Playlist";

function loadPlaylists(): { [name: string]: IPlaylist } {
    const playlists: { [name: string]: IPlaylist} = {};

    try {
        const pFile: any = yaml.load(fs.readFileSync('./src/playlists/playlists.yml', 'utf8'));
        const pFileLists = pFile.playlists;
        for (let name in pFileLists) {
            playlists[name] = new Playlist(pFileLists[name].name, pFileLists[name].players, pFileLists[name].draft, pFileLists[name].description);
        }
        return playlists;
    } catch (e) {
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

/**
 * 
 * @param playlists Current playlist objects
 * @param empty Displays empty playlists if set to true, otherwise only prints playlists with players added
 * @returns 
 */
function printPlaylists(playlists: { [name: string]: IPlaylist}, empty: boolean): string {
    let result = ``;
    for (let i in playlists) {
        let playlist = playlists[i];
        if (playlist.isEmpty() && !empty) {
            continue;
        }
        result += playlist.printList();
    }
    return result;
}

export const pl = {
    loadPlaylists,
    loadChoices,
    printPlaylists,
}