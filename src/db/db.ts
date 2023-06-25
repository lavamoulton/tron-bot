import Database, { Database as dbType } from "better-sqlite3";
import fs from "fs";
import { container } from "@sapphire/framework";

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
}

interface PlayerStats {
    id: string;
    displayName: string;
    totalCount: number;
    tronBucks: number;
    playlistCount: { [playlistName: string]: number };
}

export class DB {
    database: dbType;

    public constructor() {
        this.database = new Database("./db/pickup.sqlite");
        container.logger.debug(`Connected to database.`);
    }

    public createSchema(): void {
        /*container.logger.debug(`Clearing tables`);
        this.database.exec(`${fs.readFileSync("./db/sql/drop.sql").toString()}`);*/
        container.logger.debug(`Creating players table`);
        this.database.exec(`${fs.readFileSync("./db/sql/players.sql").toString()}`);
        container.logger.debug(`Creating playlists table`);
        this.database.exec(`${fs.readFileSync("./db/sql/playlists.sql").toString()}`);
        container.logger.debug(`Creating playlistCount table`);
        this.database.exec(`${fs.readFileSync("./db/sql/playlistCount.sql").toString()}`);
    }

    public createPlaylistRecord(
        name: string,
        players: number,
        draft: boolean,
        description: string
    ): void {
        container.logger.debug(`Creating ${name} entry in playlists table`);
        this.database
            .exec(`INSERT OR IGNORE INTO playlists (name, maxPlayers, draft, description, count)
            VALUES ('${name}', ${players}, ${draft}, '${description}', 0)`);
        this.database.exec(
            `UPDATE playlists SET maxPlayers=${players}, draft=${draft}, description='${description}' WHERE name='${name}'`
        );
        /*container.logger.debug(`Creating ${name} count table`);
        this.database.exec(`CREATE TABLE IF NOT EXISTS ${name} (
            name VARCHAR(50) NOT NULL,
            id VARCHAR(50) NOT NULL,
            count INTEGER NOT NULL,
            PRIMARY KEY (name, id)
            FOREIGN KEY (name)
                REFERENCES playlists (name)
            FOREIGN KEY (id)
                REFERENCES players (id));`);*/
        const statement = this.database.prepare(`SELECT * from playlists`);
        const rows = statement.all();
        rows.forEach((row) => {
            container.logger.debug(`Playlists: ${JSON.stringify(row)}`);
        });
    }

    public updatePlaylistRecord(name: string): void {
        container.logger.debug(`Updating ${name} record`);
        this.database.exec(`UPDATE playlists SET count=count+1 WHERE name='${name}'`);
        const statement = this.database.prepare(`SELECT * from playlists`);
        const rows = statement.all();
        rows.forEach((row) => {
            container.logger.debug(`Playlists: ${JSON.stringify(row)}`);
        });
    }

    public updatePlayerRecord(
        id: string,
        username: string,
        displayName: string,
        playlistName: string
    ): void {
        container.logger.debug(
            `Updating or creating db record for ${username}. displayName: ${displayName}, id: ${id}`
        );
        this.database.exec(`
            INSERT OR IGNORE INTO players (id, username, displayName, count, tronBucks)
                VALUES ('${id}', '${username}', '${displayName}', 0, 0)`);
        this.database.exec(
            `UPDATE players SET username='${username}', displayName='${displayName}', count=count+1, tronBucks=tronBucks+10 WHERE id='${id}'`
        );
        this.database.exec(`
            INSERT OR IGNORE INTO playlistCount (name, id, count)
                VALUES ('${playlistName}', '${id}', 0)`);
        this.database.exec(`
            UPDATE playlistCount SET count=count+1 WHERE name='${playlistName}' AND id='${id}'`);
        const statement = this.database.prepare(`SELECT * from players`);
        const rows = statement.all();
        rows.forEach((row) => {
            container.logger.debug(`SET PLAYER RECORD (players): ${JSON.stringify(row)}`);
        });
        const playlistStatement = this.database.prepare(`SELECT * from playlistCount`);
        const playlistRows = playlistStatement.all();
        playlistRows.forEach((row) => {
            container.logger.debug(
                `SET PLAYER RECORD (playlistCount): ${JSON.stringify(row)}`
            );
        });
    }

    public getPlayerRecord(id: string): PlayerData | undefined {
        container.logger.debug(`Getting player record for ${id}`);
        /*const allStatement = this.database.prepare(`SELECT * from 'players'`);
        const rows = allStatement.all();
        rows.forEach((row) => {
            container.logger.debug(`GET PLAYER RECORD: ${JSON.stringify(row)}`);
        });*/
        let data: PlayerData | undefined = undefined;
        const statement = this.database.prepare(`SELECT * FROM players WHERE id=?`);
        const playerRow = statement.all([id]);
        playerRow.forEach((row) => {
            const rowData = row as PlayerData;
            if (rowData) {
                container.logger.debug(`Player record found: ${JSON.stringify(row)}\n
                id: ${rowData.id}, username: ${rowData.username}, displayName: ${
                    rowData.displayName
                }, count: ${rowData.count}`);
                container.logger.debug(`Object keys: ${Object.keys(rowData)}`);
                data = {
                    id: rowData.id,
                    username: rowData.username,
                    displayName: rowData.displayName,
                    count: rowData.count,
                    tronBucks: rowData.tronBucks,
                };
                container.logger.debug(`Data: ${JSON.stringify(data)}`);
            }
        });
        if (!data) {
            container.logger.debug(`Did not find player data, returning undefined`);
            return undefined;
        } else {
            return data;
        }
    }

    public getPlayerStats(id: string): PlayerStats | undefined {
        const playerRecord = this.getPlayerRecord(id);
        if (!playerRecord) {
            container.logger.error(`No stats found for ${id}`);
            return undefined;
        } else {
            const playlistStats = this.getPlayerPlaylistStats(id);
            return {
                id: id,
                displayName: playerRecord.displayName,
                totalCount: playerRecord.count,
                tronBucks: playerRecord.tronBucks,
                playlistCount: playlistStats,
            };
        }
    }

    private getPlayerPlaylistStats(id: string): { [playlistName: string]: number } {
        let result: { [playlistName: string]: number } = {};
        const statement = this.database.prepare(
            `SELECT * from playlistCount WHERE id='${id}'`
        );
        const rows = statement.all();
        rows.forEach((row) => {
            const data = row as PlaylistCountData;
            result[data.name] = data.count;
        });
        return result;
    }

    public close() {
        this.database.close();
    }
}
