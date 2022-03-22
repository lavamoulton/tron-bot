import { ICommand } from "../interfaces/Command";
import { add } from "./add";
import { remove } from "./remove";
import { start } from "./start";
import { who } from "./who";

export const CommandList: ICommand[] = [add, remove, start, who];