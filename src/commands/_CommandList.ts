import { ICommand } from "../interfaces/Command";
import { add } from "./addold";
import { remove } from "./remove";
import { start } from "./start";
import { who, whowhen } from "./who";

export const CommandList: ICommand[] = [add, remove, start, who, whowhen];
