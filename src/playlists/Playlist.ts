import { User } from "discord.js";

interface IPlaylist {
    name: string,
    players: number,
    draft: boolean,
    description: string,
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

/**
 * Represents a Playlist that users can add/remove from
 */
export class Playlist implements IPlaylist {

    name: string
    players: number
    draft: boolean
    description: string
    list: { [id: string]: IAddedUser }

    constructor(name: string, players: number, draft: boolean, description: string) {
        this.name = name;
        this.players = players;
        this.draft = draft;
        this.description = description;
        this.list = {};
    }

    addPlayer(user: User): boolean {
        if (this.isPlayerAdded(user)) {
            return false;
        } else {
            this.list[user.id] = {
                id: user.id,
                displayName: user.username,
            };
            return true;
        }
    }

    removePlayer(user: User | IAddedUser): boolean {
        if (this.list.hasOwnProperty(user.id)) {
            delete this.list[user.id];
            return true;
        } else {
            return false;
        }
    }

    isPlayerAdded(user: User | IAddedUser): boolean {
        if (this.list.hasOwnProperty(user.id)) {
            return true;
        } else {
            return false;
        }
    }

    isDraft(): boolean {
        if (this.draft) {
            return true;
        } else {
            return false;
        }
    }

    getLength(): number {
        return Object.keys(this.list).length;
    }

    isFull(): boolean {
        if (this.getLength() === this.players) {
            return true;
        } else {
            return false;
        }
    }

    isEmpty(): boolean {
        if (this.getLength() === 0) {
            return true;
        } else {
            return false;
        }
    }

    clearList() {
        this.list = {};
    }

    printList() {
        let result = `${this.name} (${this.getLength()} / ${this.players}): `;
        if (this.isEmpty()) {
            result += `No players added.`
        }
        let first = true;
        for (let ID in this.list) {
            if (!first) {
                result += ', ';
            }
            result += `${this.list[ID].displayName}`;
            first = false;
        }
        result += `\n`;
        return result;
    }
}