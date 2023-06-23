import { Database } from "sqlite3";
import fs from "fs";
import { container } from "@sapphire/framework";

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
        const result = this.database.all(`SELECT * from players`, (_, res) => {
            container.logger.debug(JSON.stringify(res));
        });
    }

    /*
                ON CONFLICT ('${id}') DO
                UPDATE SET username='${username}', displayName='${displayName}', count=count+1`);*/

    public close() {
        this.database.close();
    }
}
