import { scan } from "./scan";
import { rules } from "./rules";

// Every command the CLI exposes. `mkcmd-agent add <name>` appends to this list.
export const commands = [scan, rules];
