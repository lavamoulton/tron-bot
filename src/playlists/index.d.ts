interface IPlaylists {
    [name: string]: IPlaylist;
}

interface IPlaylist {
    name: string;
    players: number;
    draft: boolean;
    description: string;
    list: { [id: string]: IAddedUser };
    addPlayer(user: User, username: string, displayName: string): boolean;
    addDummy(): void;
    removePlayer(user: User): boolean;
    isPlayerAdded(user: User): boolean;
    getLength(): number;
    isDraft(): boolean;
    isFull(): boolean;
    isEmpty(): boolean;
    clearList(): void;
    printList(): string;
    printDetailedList(): string;
    expirePlayers(): string[];
    warnPlayers(): string[];
}

interface IAddedUser {
    id: string;
    username: string;
    displayName: string;
}
