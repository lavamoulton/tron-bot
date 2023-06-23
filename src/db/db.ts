import { Database } from "sqlite3";
import fs from "fs";
import { container } from "@sapphire/framework";

interface PlayerData {
    id: string;
    username: string;
    displayName: string;
    count: number;
}

export class DB {
    database: Database;

    public constructor() {
        this.database = new Database("./db/pickup.sqlite", (err) => {
            if (err) {
                console.error(err.message);
            } else {
                console.log("Connected to the pickup database.");
            }
        });
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
        this.database.all(`SELECT * FROM 'players'`, (_, res) => {
            container.logger.debug(`SET PLAYER RECORD: ${JSON.stringify(res)}`);
        });
    }

    public getPlayerRecord(id: string): PlayerData | undefined {
        container.logger.debug(`Getting player record for ${id}`);
        this.database.all(`SELECT * FROM 'players'`, (_, res) => {
            container.logger.debug(`GET PLAYER RECORD: ${JSON.stringify(res)}`);
        });
        let data: PlayerData | undefined = undefined;
        const statement = this.database.prepare(`SELECT * FROM 'players' WHERE id=?`);
        statement.run([id], (_: Error, res: PlayerData) => {
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
        });
        if (!data) {
            container.logger.debug(`Did not find player data, returning undefined`);
            return undefined;
        }
    }

    public close() {
        this.database.close();
    }
}
