#!/usr/bin/env bun
import { runCLI } from "./core/cli";
import { commands } from "./commands";

process.exitCode = await runCLI({
  name: "scrub",
  about: "Scan prose for AI writing tells: dashes, stock phrases, pre-negation, flat rhythm. A gate for anything published under your name.",
  commands,
});
