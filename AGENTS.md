# AGENTS.md

prose-scrub: Scan prose for AI writing tells: dashes, stock phrases, pre-negation, flat rhythm. A gate for anything published under your name.

## Run

- `bun install`, then `bun run src/index.ts <command> [flags]`.
- `bun run src/index.ts describe` prints every command, flag and example as JSON. Start there.

## Output contract

The framework in `src/core/cli.ts` enforces this for every command. Do not print results with `console.log`.

- `--json` prints exactly one object on stdout: `{"ok": true, "command", "result"}` or `{"ok": false, "command", "error": {"code", "message", "hint"}}`.
- Without `--json`, results print as text (the command's `render`, or a key: value dump).
- Progress goes to stderr through `ctx.log`. stdout is reserved for the result.
- Exit codes: 0 success, 1 failure, 2 usage error (unknown command, unknown flag, missing required flag).
- Nothing prompts. A missing required flag is a usage error (exit 2) that shows the command's first example.

## Add a command

`mkcmd-agent add <name> --summary "..."` writes `src/commands/<name>.ts` and registers it. By hand:

1. Create `src/commands/<name>.ts` exporting `defineCommand({ name, summary, flags, examples, run })`.
2. `run` gets `{ flags, args, json, log }` and returns JSON-serialisable data.
3. Fail with `throw new CliError(message, { code, hint, details })`. `details` is for structured findings (a failing check still reports them). Use `UsageError` for bad input (exit 2).
4. Add it to the array in `src/commands/index.ts`.
5. Give it at least one example. The first example is shown when a required flag is missing.

## Layout

- `src/index.ts`: entry point; passes name, about and commands to `runCLI`.
- `src/core/cli.ts`: the framework. Copied from mkcmd-agent; edit it if you need to, it has no dependencies.
- `src/commands/`: one file per command, plus `index.ts` listing them.

## Changelog

Every commit adds an entry at the top of `CHANGELOG.md`, in the same commit. Write it in prose for a person who uses the tool: what changed, why, and what it does to their results (a rule that finds more, a file type that now parses, a score that moves). Head each entry with the date and the commit subject. The hash doesn't exist until the commit does, so leave it out.

## Rules

- No tests here (Mackenzie, 2026-10-15: every test was deleted). Show a change working by running the program, in the hand-back.
- Never relax a rule, threshold or extraction to make text pass. If a rule misfires, say so with the file, the finding and why.
- README.md, CHANGELOG.md and AGENTS.md must pass `prose-scrub scan`; a test checks this. Findings in them go to a second agent to fix, never to the one that wrote them.
