# AGENTS.md

prose-scrub: Scan prose for AI writing tells: dashes, stock phrases, pre-negation, flat rhythm. A gate for anything published under your name.

## Run

- `bun install`, then `bun run src/index.ts <command> [flags]`.
- `bun run src/index.ts describe` prints every command, flag and example as JSON. Start there.
- `bun test` runs `test/cli.test.ts`, which drives the CLI as a subprocess.

## Output contract

The framework in `src/core/cli.ts` enforces this for every command. Do not print results with `console.log`.

- `--json` prints exactly one object on stdout: `{"ok": true, "command", "result"}` or `{"ok": false, "command", "error": {"code", "message", "hint"}}`.
- Without `--json`, results print as text (the command's `render`, or a key: value dump).
- Progress goes to stderr through `ctx.log`. stdout is reserved for the result.
- Exit codes: 0 success, 1 failure, 2 usage error (unknown command, unknown flag, missing required flag).
- Prompts happen only for required flags that declare `prompt`, only at an interactive terminal, and never with `--json` or `--no-input`. Agents never see them.

## Add a command

`mkcmd-agent add <name> --summary "..."` writes `src/commands/<name>.ts` and registers it. By hand:

1. Create `src/commands/<name>.ts` exporting `defineCommand({ name, summary, flags, examples, run })`.
2. `run` gets `{ flags, args, json, interactive, log }` and returns JSON-serialisable data.
3. Fail with `throw new CliError(message, { code, hint, details })`. `details` is for structured findings (a failing check still reports them). Use `UsageError` for bad input (exit 2).
4. Add it to the array in `src/commands/index.ts`.
5. Give it at least one example. The first example is shown when a required flag is missing.

## Layout

- `src/index.ts`: entry point; passes name, about and commands to `runCLI`.
- `src/core/cli.ts`: the framework. Copied from mkcmd-agent; edit it if you need to, it has no dependencies.
- `src/commands/`: one file per command, plus `index.ts` listing them.
- `test/cli.test.ts`: subprocess tests of the contract.
