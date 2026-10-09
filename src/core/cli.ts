// A small, dependency-free command framework built to be driven by agents as
// well as people. mkcmd-agent copies this file into every CLI it generates.
//
// The contract:
//   - Every input is a flag or positional. Nothing blocks on a prompt unless a
//     human is at a terminal, and `--no-input` turns even that off.
//   - `--json` prints exactly one JSON object on stdout:
//       { "ok": true,  "command": "...", "result": ... }
//       { "ok": false, "command": "...", "error": { "code", "message", "hint" } }
//   - Progress and logs go to stderr, so stdout stays parseable.
//   - Exit codes: 0 success, 1 failure, 2 usage error.
//   - `describe` prints every command and flag as JSON. `<cmd> --help` prints
//     usage, flags and examples for one command.

import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";

export type FlagSpec = {
  type: "string" | "boolean";
  description: string;
  required?: boolean;
  default?: string | boolean;
  short?: string;
  /** Question to ask when the flag is missing and a human is at a terminal. */
  prompt?: string;
};

export type Flags = Record<string, FlagSpec>;

type FlagValue<S extends FlagSpec> = S["type"] extends "boolean"
  ? boolean
  : S extends { required: true } | { default: string }
    ? string
    : string | undefined;

export type FlagValues<F extends Flags> = { [K in keyof F]: FlagValue<F[K]> };

export type Context<F extends Flags> = {
  flags: FlagValues<F>;
  /** Positional arguments after the command name. */
  args: string[];
  /** True when output is JSON. Commands rarely need this; return data instead. */
  json: boolean;
  /** True when a human is at a terminal and prompting is allowed. */
  interactive: boolean;
  /** Progress messages. Always stderr, so stdout stays clean. */
  log: (message: string) => void;
};

export type Command<F extends Flags = Flags, R = unknown> = {
  name: string;
  summary: string;
  description?: string;
  flags?: F;
  /** Usage text for positionals, e.g. "<file...>". */
  args?: string;
  examples?: string[];
  /** Return a JSON-serialisable result. Throw CliError to fail. */
  run: (ctx: Context<F>) => Promise<R> | R;
  /** Human-readable rendering of the result. Defaults to a key: value dump. */
  render?: (result: R) => string;
};

/** Identity helper that gives `run` typed flags. */
export function defineCommand<F extends Flags, R>(cmd: Command<F, R>): Command<F, R> {
  return cmd;
}

export class CliError extends Error {
  code: string;
  hint?: string;
  exitCode: number;
  /** Structured data about the failure, e.g. what a check found. JSON: error.details. */
  details?: unknown;
  constructor(message: string, opts: { code?: string; hint?: string; exitCode?: number; details?: unknown } = {}) {
    super(message);
    this.code = opts.code ?? "error";
    this.hint = opts.hint;
    this.exitCode = opts.exitCode ?? 1;
    this.details = opts.details;
  }
}

export class UsageError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { code: "usage", hint, exitCode: 2 });
  }
}

export type CliMeta = {
  name: string;
  about: string;
  // Commands are stored type-erased; defineCommand keeps each one typed.
  commands: Command<any, any>[];
  version?: string;
};

const GLOBAL_FLAGS: Flags = {
  json: { type: "boolean", description: "Print one JSON object on stdout instead of text." },
  help: { type: "boolean", short: "h", description: "Show help for the CLI or a command." },
  "no-input": { type: "boolean", description: "Never prompt, even at a terminal." },
};

type Out = { stdout: (s: string) => void; stderr: (s: string) => void };
const defaultOut: Out = {
  stdout: (s) => process.stdout.write(s + "\n"),
  stderr: (s) => process.stderr.write(s + "\n"),
};

/** Runs the CLI and returns the exit code. The caller decides whether to exit. */
export async function runCLI(meta: CliMeta, argv = process.argv.slice(2), out: Out = defaultOut): Promise<number> {
  const json = argv.includes("--json");
  const noInput = argv.includes("--no-input");
  const interactive = !json && !noInput && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const [first, ...rest] = argv;
  let commandName = "";
  let activeCommand: Command<any, any> | undefined;

  const emitOk = (result: unknown, render?: (r: any) => string) => {
    if (json) {
      out.stdout(JSON.stringify({ ok: true, command: commandName, result: result ?? null }));
    } else if (result !== undefined) {
      out.stdout(render ? render(result) : formatHuman(result));
    }
  };

  const emitErr = (err: unknown): number => {
    const e =
      err instanceof CliError
        ? err
        : new CliError(err instanceof Error ? err.message : String(err), { code: "internal" });
    if (json) {
      const error: Record<string, unknown> = { code: e.code, message: e.message };
      if (e.hint) error.hint = e.hint;
      if (e.details !== undefined) error.details = e.details;
      out.stdout(JSON.stringify({ ok: false, command: commandName || null, error }));
    } else {
      // Details print like a result (through the command's render), so a failing check still shows its report.
      if (e.details !== undefined) {
        out.stdout(activeCommand?.render ? activeCommand.render(e.details) : formatHuman(e.details));
      }
      out.stderr(`error: ${e.message}`);
      if (e.hint) out.stderr(`hint: ${e.hint}`);
    }
    return e.exitCode;
  };

  try {
    if (first === "-v" || first === "--version") {
      commandName = "version";
      const version = meta.version ?? readVersion();
      emitOk(json ? { name: meta.name, version } : `${meta.name} ${version}`);
      return 0;
    }
    if (!first || first.startsWith("-")) {
      if (!first || first === "-h" || first === "--help" || first === "--json") {
        commandName = "help";
        emitOk(json ? describe(meta) : helpText(meta), (s: string) => s);
        return first ? 0 : 2;
      }
      throw new UsageError(`Unknown option ${first}.`, `Run \`${meta.name} --help\`.`);
    }

    commandName = first;
    if (first === "describe") {
      out.stdout(JSON.stringify(describe(meta), null, 2));
      return 0;
    }
    if (first === "help") {
      const target = rest.find((a) => !a.startsWith("-"));
      const cmd = target ? findCommand(meta, target) : undefined;
      emitOk(json ? describe(meta, cmd) : cmd ? commandHelp(meta, cmd) : helpText(meta), (s: string) => s);
      return 0;
    }

    const cmd = findCommand(meta, first);
    activeCommand = cmd;
    const flagSpecs: Flags = { ...GLOBAL_FLAGS, ...flagsOf(cmd) };
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: Object.fromEntries(
          Object.entries(flagSpecs).map(([k, s]) => [k, { type: s.type, ...(s.short ? { short: s.short } : {}) }]),
        ),
        allowPositionals: true,
        strict: true,
      });
    } catch (e) {
      throw new UsageError(
        (e as Error).message.replace(/\. To specify.*$/s, "."),
        `Run \`${meta.name} ${cmd.name} --help\` for valid flags.`,
      );
    }
    const values = parsed.values as Record<string, string | boolean | undefined>;

    if (values.help) {
      emitOk(json ? describe(meta, cmd) : commandHelp(meta, cmd), (s: string) => s);
      return 0;
    }

    const flags: Record<string, string | boolean | undefined> = {};
    const missing: string[] = [];
    for (const [key, spec] of Object.entries(flagsOf(cmd))) {
      let v = values[key];
      if (v === undefined && spec.required && spec.prompt && interactive) {
        v = (await ask(spec.prompt)) || undefined;
      }
      if (v === undefined) v = spec.default ?? (spec.type === "boolean" ? false : undefined);
      if (v === undefined && spec.required) missing.push(`--${key}`);
      flags[key] = v;
    }
    if (missing.length) {
      throw new UsageError(
        `Missing required flag${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
        `Example: ${cmd.examples?.[0] ?? `${meta.name} ${cmd.name} --help`}`,
      );
    }

    const result = await cmd.run({
      flags: flags as FlagValues<Flags>,
      args: parsed.positionals,
      json,
      interactive,
      log: (m) => out.stderr(m),
    });
    emitOk(result, cmd.render);
    return 0;
  } catch (err) {
    return emitErr(err);
  }
}

function flagsOf(c: Command<any, any>): Flags {
  return (c.flags ?? {}) as Flags;
}

function findCommand(meta: CliMeta, name: string): Command<any, any> {
  const cmd = meta.commands.find((c) => c.name === name);
  if (cmd) return cmd;
  const names = meta.commands.map((c) => c.name);
  const near = names.find((n) => n.startsWith(name) || name.startsWith(n));
  throw new UsageError(
    `Unknown command "${name}".`,
    near ? `Did you mean \`${meta.name} ${near}\`?` : `Commands: ${[...names, "describe", "help"].join(", ")}.`,
  );
}

/** Machine-readable description of the CLI, or of one command. */
export function describe(meta: CliMeta, only?: Command<any, any>) {
  const cmdJson = (c: Command<any, any>) => ({
    name: c.name,
    summary: c.summary,
    ...(c.description ? { description: c.description } : {}),
    usage: usage(meta, c),
    flags: Object.entries(flagsOf(c)).map(([name, s]) => ({
      name: `--${name}`,
      ...(s.short ? { short: `-${s.short}` } : {}),
      type: s.type,
      required: Boolean(s.required),
      ...(s.default !== undefined ? { default: s.default } : {}),
      description: s.description,
    })),
    examples: c.examples ?? [],
  });
  if (only) return cmdJson(only);
  return {
    name: meta.name,
    about: meta.about,
    contract: {
      json: "--json prints one object on stdout: {ok, command, result} or {ok:false, command, error:{code, message, hint?, details?}}",
      exitCodes: { "0": "success", "1": "failure", "2": "usage error" },
      stderr: "progress and logs only",
      prompts: "only at an interactive terminal; --no-input disables them",
    },
    globalFlags: Object.entries(GLOBAL_FLAGS).map(([name, s]) => ({
      name: `--${name}`,
      ...(s.short ? { short: `-${s.short}` } : {}),
      type: s.type,
      description: s.description,
    })),
    commands: meta.commands.map(cmdJson),
  };
}

function usage(meta: CliMeta, c: Command<any, any>): string {
  const req = Object.entries(flagsOf(c))
    .filter(([, s]) => s.required)
    .map(([k, s]) => `--${k}${s.type === "string" ? ` <${k}>` : ""}`);
  return [meta.name, c.name, ...req, c.args ?? "", "[flags]"].filter(Boolean).join(" ");
}

function helpText(meta: CliMeta): string {
  const width = Math.max(8, ...meta.commands.map((c) => c.name.length));
  const lines = [
    `${meta.name}: ${meta.about}`,
    "",
    "Commands:",
    ...meta.commands.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
    `  ${"describe".padEnd(width)}  Print every command and flag as JSON`,
    `  ${"help".padEnd(width)}  Show help for a command`,
    "",
    "Global flags:",
    ...flagLines(GLOBAL_FLAGS),
    "",
    `Run \`${meta.name} <command> --help\` for a command's flags and examples.`,
  ];
  return lines.join("\n");
}

function commandHelp(meta: CliMeta, c: Command<any, any>): string {
  const lines = [`${meta.name} ${c.name}: ${c.summary}`, "", `Usage: ${usage(meta, c)}`];
  if (c.description) lines.push("", c.description);
  if (c.flags && Object.keys(c.flags).length) lines.push("", "Flags:", ...flagLines(c.flags));
  lines.push("", "Global flags:", ...flagLines(GLOBAL_FLAGS));
  if (c.examples?.length) lines.push("", "Examples:", ...c.examples.map((e) => `  ${e}`));
  return lines.join("\n");
}

function flagLines(flags: Flags): string[] {
  const rows = Object.entries(flags).map(([k, s]) => {
    const name = `${s.short ? `-${s.short}, ` : ""}--${k}${s.type === "string" ? ` <${k}>` : ""}`;
    const notes = [s.required ? "required" : "", s.default !== undefined && s.default !== false ? `default: ${s.default}` : ""]
      .filter(Boolean)
      .join(", ");
    return [name, `${s.description}${notes ? ` (${notes})` : ""}`] as const;
  });
  const width = Math.max(...rows.map(([n]) => n.length));
  return rows.map(([n, d]) => `  ${n.padEnd(width)}  ${d}`);
}

function formatHuman(value: unknown, indent = ""): string {
  if (value === null || typeof value !== "object") return `${indent}${String(value)}`;
  if (Array.isArray(value) && value.length === 0) return `${indent}(none)`;
  if (Object.keys(value).length === 0) return `${indent}(empty)`;
  if (Array.isArray(value)) {
    return value
      .map((v) => (v !== null && typeof v === "object" ? formatHuman(v, indent + "  ") : `${indent}- ${String(v)}`))
      .join("\n");
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) =>
      v !== null && typeof v === "object" ? `${indent}${k}:\n${formatHuman(v, indent + "  ")}` : `${indent}${k}: ${String(v)}`,
    )
    .join("\n");
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(`${question} `)).trim();
  } finally {
    rl.close();
  }
}

/** Finds the nearest package.json above this file, so it works from src/ and dist/. */
function readVersion(): string {
  let dir = import.meta.dir;
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "package.json");
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).version ?? "0.0.0";
    dir = dirname(dir);
  }
  return "0.0.0";
}
