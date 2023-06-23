import { Database } from "sqlite3";

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

    public close() {
        this.database.close();
    }
}
