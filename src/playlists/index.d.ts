interface IPlaylist {
    name: string,
    players: number,
    draft: boolean,
    list: { [id: string]: IAddedUser },
    addPlayer(user: User): boolean,
    removePlayer(user: User): boolean,
    isPlayerAdded(user: User): boolean,
    isFull(): boolean,
    isEmpty(): boolean,
    printList(): string,
}

interface IAddedUser {
    id: string,
    displayName: string,
}