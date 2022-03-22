import { User } from "discord.js";
import "jest";
import { Playlist } from "../../../src/playlists/Playlist";
import { pl } from "../../../src/playlists/playlists";
import { CommandList } from "../../../src/commands/_CommandList";
import { MockDiscord, MockData, fillList } from "../../helpers/mockDiscord";

describe('playlist tests', () => {
    test('initial data', () => {
        const playlists = pl.loadPlaylists();
        expect(playlists).not.toBeNull();
        for (let i in playlists) {
            let playlist = playlists[i];
            expect(playlist.name).not.toBeNull();
            expect(playlist.draft).not.toBeNull();
            expect(playlist.list).not.toBeNull();
            expect(playlist.description).not.toBeNull();
            expect(Object.keys(playlist.list).length).toEqual(0);
        }
        let fortPlaylist = playlists['fort'];
        expect(fortPlaylist.name).toEqual('Fortress');
        expect(fortPlaylist.draft).toEqual(true);
        expect(fortPlaylist.description).toMatch('Fortress 6v6');
    });

    test('Playlist object', () => {
        const mockUser = MockData.getMockUser();
        const testPlaylist = new Playlist("test", 6, true, "test playlist");
        const testPlaylist2 = new Playlist("test2", 6, false, "test playlist 2");
        
        expect(testPlaylist.addPlayer(mockUser)).toEqual(true);
        expect(testPlaylist.addPlayer(mockUser)).toEqual(false);

        expect(testPlaylist.isPlayerAdded(mockUser)).toEqual(true);
        expect(testPlaylist.getLength()).toEqual(1);
        expect(testPlaylist.isFull()).toEqual(false);
        expect(testPlaylist.isEmpty()).toEqual(false);

        expect(testPlaylist.printList()).toMatch(`test (1 / 6): ${mockUser.username}`);

        expect(testPlaylist.removePlayer(mockUser)).toEqual(true);
        expect(testPlaylist.removePlayer(mockUser)).toEqual(false);

        expect(testPlaylist.isPlayerAdded(mockUser)).toEqual(false);
        expect(testPlaylist.getLength()).toEqual(0);
        expect(testPlaylist.isFull()).toEqual(false);
        expect(testPlaylist.isEmpty()).toEqual(true);

        expect(testPlaylist.printList()).toMatch(`No players added.`);

        expect(testPlaylist.isDraft()).toEqual(true);
        expect(testPlaylist2.isDraft()).toEqual(false);
    });

    test('Starting playlists', () => {
        const mockUser = MockData.getMockUser();
        const testPlaylist = new Playlist("test", 6, true, "test playlist");
        const tstPlaylist = new Playlist("tst", 8, false, "Team sumo 2v2v2v2");
        const sbPlaylist = new Playlist("Sumobar", 8, false, "Sumobar 8 players");
        const testPlaylists = { "test": testPlaylist,
                                "tst": tstPlaylist,
                                "sumobar": sbPlaylist };

        MockData.fillList(testPlaylist);
        expect(testPlaylist.isFull()).toEqual(true);

        pl.removeFromPlaylist("test", mockUser, testPlaylists);

        let draftStartExp = new RegExp(/-{5}\s\w{1,}\s\w{1,}\s\w{1,}\s\w{1,}!\s-{5}(\s{1,}\w{1,}\s\w{1,}\s\w{1,}\s<:\w{1,}:\d{1,}>:\s<@\w{1,}-\w{1,}>){2}\s{1,}\w{1,}:\s<@\w{1,}-\w{1,}>(,<@\w{1,}-\w{1,}>){3}/);

        expect(pl.addToPlaylist("test", mockUser, testPlaylists)).toMatch(draftStartExp);

        MockData.fillList(tstPlaylist);
        pl.removeFromPlaylist("tst", mockUser, testPlaylists);

        let tstStartExp = new RegExp(/-{5}\s\w{1,}\s\w{1,}\s\w{1,}\s\w{1,}!\s-{5}(\s\w{1,}\s\w{1,}\s<:\w{1,}:\d{1,}>:\s<@(\w{1,}\s?-?\w{1,}?)>,\s<@(\w{1,}\s?-?\w{1,}?)>){4}/);

        expect(pl.addToPlaylist("tst", mockUser, testPlaylists)).toMatch(tstStartExp);

        MockData.fillList(sbPlaylist);
        pl.removeFromPlaylist("sumobar", mockUser, testPlaylists);

        let sbStartExp = new RegExp(/-{5}\s\w{1,}\s\w{1,}\s\w{1,}\s\w{1,}!\s-{5}\s{1,}\w{1,}:\s<@\w{1,}\s?-?\w{1,}>(,\s<@\w{1,}\s?-?\w{1,}>){7}/);

        expect(pl.addToPlaylist("sumobar", mockUser, testPlaylists)).toMatch(sbStartExp);

    });

    test('playlists methods', () => {
        const mockUser = MockData.getMockUser();
        const playlists = pl.loadPlaylists();
        const testPlaylist = "fort";
        const fortPlaylist = playlists[testPlaylist];

        let emptyPlaylistString = `Fortress (0 / 12): No players added.\n`;
        emptyPlaylistString+= `TST (0 / 8): No players added.\n`;
        emptyPlaylistString+= `WST (0 / 6): No players added.\n`;
        emptyPlaylistString+= `CTF (0 / 8): No players added.\n`;
        emptyPlaylistString+= `Sumobar (0 / 8): No players added.`;
        expect(pl.printPlaylists(playlists, true)).toMatch(emptyPlaylistString);

        expect(fortPlaylist.isDraft()).toEqual(true);
        expect(playlists['tst'].isDraft()).toEqual(false);

        expect(pl.addToPlaylist(testPlaylist, mockUser, playlists))
            .toMatch(`Fortress (1 / 12): username0`);
        expect(fortPlaylist.getLength()).toEqual(1);
        expect(fortPlaylist.isFull()).toEqual(false);
        expect(fortPlaylist.isEmpty()).toEqual(false);
        expect(fortPlaylist.isPlayerAdded(mockUser)).toEqual(true);
        expect(fortPlaylist.printList()).toMatch(`Fortress (1 / 12): username0`);

        playlists['tst'].addPlayer(mockUser);
        expect(pl.addToPlaylist(testPlaylist, mockUser, playlists))
            .toMatch(`${mockUser}, you are already added to ${testPlaylist}!\n`);
        expect(pl.getAddedPlayers(playlists)).toMatch(`Fortress (1 / 12): username0\nTST (1 / 8): username0`);
        playlists['tst'].removePlayer(mockUser);
        expect(fortPlaylist.getLength()).toEqual(1);

        expect(pl.removeFromPlaylist(testPlaylist, mockUser, playlists))
            .toMatch(`Fortress (0 / 12): No players added`);
        expect(fortPlaylist.getLength()).toEqual(0);
        expect(fortPlaylist.isPlayerAdded(mockUser)).toEqual(false);
        expect(fortPlaylist.isEmpty()).toEqual(true);

        expect(pl.printPlaylists(playlists, false)).toMatch(`No players added`);
        expect(pl.removeFromPlaylist(testPlaylist, mockUser, playlists))
            .toMatch(`${mockUser}, you are not added to ${testPlaylist}!\n`);
        expect(pl.getAddedPlayers(playlists)).toMatch('No players added.');            
    });
});