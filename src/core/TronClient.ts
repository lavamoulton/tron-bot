import { SapphireClient, container } from "@sapphire/framework";
import { getRootData } from "@sapphire/pieces";
import { CLIENT_OPTIONS, config } from "../config/config";
import { Message } from "discord.js";
import { join } from "node:path";
import { Manager } from "./Manager";
import sqlite3 from "sqlite3";
import { DB } from "../db/db";

require("@sapphire/plugin-logger/register");

export class TronClient extends SapphireClient {
    private rootData = getRootData();
    private buildPath = `dist\\build`;

    public constructor() {
        super(CLIENT_OPTIONS);

        container.logger.debug(`Registering paths: ${join(
            this.rootData.root,
            this.buildPath
        )} + 
            listeners
            commands
            preconditions`);
        this.stores
            .get("listeners")
            .registerPath(join(this.rootData.root, this.buildPath, "listeners"));
        this.stores
            .get("commands")
            .registerPath(join(this.rootData.root, this.buildPath, "commands"));
        this.stores
            .get("preconditions")
            .registerPath(join(this.rootData.root, this.buildPath, "preconditions"));
    }

    public async login(token?: string) {
        const loginResponse = await super.login(token);
        return loginResponse;
    }

    public async destroy() {
        return super.destroy();
    }

    public fetchPrefix = async (message: Message) => {
        return [config.PREFIX, ""] as readonly string[];
    };
}

declare module "@sapphire/pieces" {
    interface Container {
        manager: Manager;
        db: DB;
    }
}
