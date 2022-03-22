import * as yaml from "js-yaml";
import * as fs from "fs";

export function loadCaptains(): string[] {
    const captains = [];

    try {
        const cFile: any = yaml.load(fs.readFileSync('./src/captains/captains.yml', 'utf8'));
        const cFileLists = cFile.captains;
        for (let id in cFileLists) {
            captains.push(cFileLists[id]);
        }
        return captains;
    } catch (e) {
        console.log(e);
        return [];
    }
}