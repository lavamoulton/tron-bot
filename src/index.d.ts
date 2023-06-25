interface PlayerData {
    id: string;
    username: string;
    displayName: string;
    count: number;
    tronBucks: number;
}

interface PlaylistCountData {
    id: string;
    name: string;
    count: number;
    tronBucks: number;
}

interface PlayerStats {
    id: string;
    displayName: string;
    totalCount: number;
    playlistCount: { [playlistName: string]: number };
}
