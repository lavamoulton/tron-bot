import { User } from "discord.js";

interface IPlaylist {
    name: string;
    players: number;
    draft: boolean;
    description: string;
    list: { [id: string]: IAddedUser };
    addPlayer(user: User): boolean;
    removePlayer(user: User): boolean;
    isPlayerAdded(user: User): boolean;
    isFull(): boolean;
    isEmpty(): boolean;
    printList(): string;
    printDetailedList(): string;
    expirePlayers(): string[];
    warnPlayers(): string[];
}

interface IAddedUser {
    id: string;
    displayName: string;
    addedAt: Date;
    warned: boolean;
}

/**
 * Represents a Playlist that users can add/remove from
 */
export class Playlist implements IPlaylist {
    static EXPIRE_AFTER_TIME_IN_MINUTES =
        parseInt(<string>process.env.EXPIRE_AFTER_TIME_IN_MINUTES, 10) || 60;
    static WARN_AFTER_TIME_IN_MINUTES =
        parseInt(<string>process.env.WARN_AFTER_TIME_IN_MINUTES, 10) || 50;

    name: string;
    players: number;
    draft: boolean;
    description: string;
    list: { [id: string]: IAddedUser };

    constructor(name: string, players: number, draft: boolean, description: string) {
        this.name = name;
        this.players = players;
        this.draft = draft;
        this.description = description;
        this.list = {};
    }

    addPlayer(user: User): boolean {
        if (this.isPlayerAdded(user)) {
            this.refreshPlayerAddedAt(user);
            return false;
        } else {
            this.list[user.id] = {
                id: user.id,
                displayName: user.username,
                addedAt: new Date(),
                warned: false,
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

    refreshPlayerAddedAt(user: User | IAddedUser): void {
        this.list[user.id].addedAt = new Date();
        this.list[user.id].warned = false;
    }

    expirePlayers(): string[] {
        let playerIDsToDelete: string[] = [];
        for (let ID in this.list) {
            let player = this.list[ID];
            if (
                Date.now() - new Date(player.addedAt).getTime() >
                Playlist.EXPIRE_AFTER_TIME_IN_MINUTES * 60 * 1000
            ) {
                playerIDsToDelete.push(ID);
            }
        }
        return playerIDsToDelete;
    }

    warnPlayers(): string[] {
        let playerIDsToWarn: string[] = [];
        for (let ID in this.list) {
            let player = this.list[ID];
            if (
                Date.now() - new Date(player.addedAt).getTime() >
                    Playlist.WARN_AFTER_TIME_IN_MINUTES * 60 * 1000 &&
                player.warned === false
            ) {
                playerIDsToWarn.push(ID);
                player.warned = true;
            }
        }
        return playerIDsToWarn;
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

    printList(): string {
        let result = `${this.name} (${this.getLength()} / ${this.players}): `;
        if (this.isEmpty()) {
            result += `No players added.`;
        }
        let first = true;
        for (let ID in this.list) {
            if (!first) {
                result += ", ";
            }
            result += `${this.list[ID].displayName}`;
            first = false;
        }
        result += `\n`;
        return result;
    }

    printDetailedList(): string {
        let result = `${this.name} (${this.getLength()} / ${this.players}): `;
        if (this.isEmpty()) {
            result += `No players added.`;
        }
        let first = true;
        for (let ID in this.list) {
            if (!first) {
                result += ", ";
            }
            result += `**${this.list[ID].displayName}**`;
            result += ` (<t:${(this.list[ID].addedAt.getTime() / 1000).toFixed(0)}:R>)`;
            first = false;
        }
        result += `\n`;
        return result;
    }
}
