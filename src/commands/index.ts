import { scan } from "./scan";
import { rules } from "./rules";
import { headings } from "./headings";

// Every command the CLI exposes. `mkcmd-agent add <name>` appends to this list.
export const commands = [scan, rules, headings];
