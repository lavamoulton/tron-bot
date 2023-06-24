import Database, { Database as dbType } from "better-sqlite3";
import fs from "fs";
import { container } from "@sapphire/framework";

interface PlayerData {
    id: string;
    username: string;
    displayName: string;
    count: number;
}

export class DB {
    database: dbType;

    public constructor() {
        this.database = new Database("./db/pickup.sqlite");
        container.logger.debug(`Connected to database.`);
    }

    public createSchema(): void {
        container.logger.debug(`${fs.readFileSync("./db/sql/players.sql").toString()}`);
        this.database.exec(`${fs.readFileSync("./db/sql/players.sql").toString()}`);
    }

    public updatePlayerRecord(id: string, username: string, displayName: string): void {
        container.logger.debug(
            `Updating or creating db record for ${username}. displayName: ${displayName}, id: ${id}`
        );
        /*const currentRecord = this.database.get(`
            SELECT * from players WHERE id='${id}'`);*/
        this.database.exec(`
            INSERT OR IGNORE INTO players (id, username, displayName, count)
                VALUES ('${id}', '${username}', '${displayName}', 0)`);
        this.database.exec(
            `UPDATE players SET username='${username}', displayName='${displayName}', count=count+1 WHERE id='${id}'`
        );
        const statement = this.database.prepare(`SELECT * from 'players'`);
        const rows = statement.all();
        rows.forEach((row) => {
            container.logger.debug(`SET PLAYER RECORD: ${JSON.stringify(row)}`);
        });
    }

    public async getPlayerRecord(id: string): Promise<PlayerData | undefined> {
        container.logger.debug(`Getting player record for ${id}`);
        /*const allStatement = this.database.prepare(`SELECT * from 'players'`);
        const rows = allStatement.all();
        rows.forEach((row) => {
            container.logger.debug(`GET PLAYER RECORD: ${JSON.stringify(row)}`);
        });*/
        let data: PlayerData | undefined = undefined;
        const statement = this.database.prepare(`SELECT * FROM 'players' WHERE id=?`);
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
                };
                container.logger.debug(`Data: ${JSON.stringify(data)}`);
            }
        });
        /*statement.all([`${id}`], (_: Error, res: PlayerData) => {
            container.logger.debug(`Found res ${JSON.stringify(res)}`);
            if (res) {
                data = {
                    id: res.id,
                    username: res.username,
                    displayName: res.displayName,
                    count: res.count,
                };
                container.logger.debug(JSON.stringify(data));
                return data;
            } else {
                container.logger.debug(`Did not find record ${JSON.stringify(res)}`);
            }
        });*/
        if (!data) {
            container.logger.debug(`Did not find player data, returning undefined`);
            return undefined;
        } else {
            return data;
        }
    }

    public close() {
        this.database.close();
    }
}
