# prose-scrub

A gate for prose. It scans Markdown, HTML, plain text and the text inside TypeScript and JSX for the habits that make writing read as machine-made: em dashes, curly quotes, stock phrases, `it's not X, it's Y`, filler, and sentences that all run the same length. Any finding fails the scan.

It's built for agents. Nothing prompts, every result is available as one JSON object, and the exit code says what happened. An agent can run it, read the findings, hand them to a rewriter and scan again.

```bash
git clone https://github.com/mackenziebowes/prose-scrub && cd prose-scrub
bun install
bun src/index.ts scan README.md docs/ site/app --json
bun src/index.ts scan --stdin --as md --json < draft.md
bun src/index.ts rules --json
bun src/index.ts headings post.md --json
bun src/index.ts describe
```

## Exit codes and output

| Exit | Meaning |
| ---- | ------- |
| 0 | Clean. |
| 1 | Findings. `--json` prints `{"ok": false, "error": {"code": "slop_found", "details": {...}}}`. |
| 2 | Bad input: no files, a missing file, an unsupported type, an unknown flag. |

Each finding has `file`, `line`, `col`, `rule`, `match`, `context` and `fix`. Line and column point into the original file, even inside a JSX string or after an HTML entity. Each file in the report also gets `words`, `sentences` and `burstiness`.

Without `--json`, findings print one per line for a person to read, and the verdict goes to stderr.

## What it reads

Files are parsed, not pattern-matched:

- Markdown and MDX with mdast (GitHub tables, autolinks and footnotes, front matter). Templates named `*.md.txt` count as Markdown.
- HTML with parse5.
- TS, TSX, JS and JSX with the TypeScript compiler: JSX text and string literals.
- Plain text, split into paragraphs on blank lines.

Code blocks, inline code, URLs, blockquotes, scripts, styles, imports, types and class lists are skipped. Alt text, meta descriptions and front matter titles are checked. Character rules (dashes, quotes, ellipses) apply to every string a reader could see, however short. Phrase rules apply to text that reads like prose.

Directories are scanned recursively, leaving out `node_modules`, `.git` and build output.

## Rules

`bun src/index.ts rules --json` lists every rule with its description and fix. In short:

- **dash**, **quote**, **ellipsis**: em and en dashes, double hyphens, curly quotes, the one-character ellipsis.
- **phrase**: stock phrases from the deslop list, throat-clearing openers, emphasis crutches, filler, meta-commentary, vague declaratives, jargon.
- **structure**: pre-negation (`it's not X, it's Y` and its cousins), trailing participle clauses, sentences that open with Moreover or Additionally.
- **word**: corporate words and softening adverbs.
- **rhythm.flat**: burstiness (the standard deviation of sentence length divided by the mean) under 0.6. It's measured over paragraphs only, once there are five sentences of three or more words. Headings, list items, table cells and labels don't count.

`--ignore dash,word.adverb` skips rules by id or prefix. `structure.pre-negation` can't be skipped.

## Headings

`bun src/index.ts headings post.md --json` lists a Markdown file's headings in order, each with its depth and line, and leaves out anything in code blocks or front matter. It isn't part of the gate. It exists for one check the rules can't make: whether every section is written up as the most important one. The skill sends the list to a small model and asks how important each heading is meant to sound, since a list of headings costs far less to send than the whole file.

## Two rules for using it

1. **Don't relax the gate to make text pass.** If a rule looks wrong, stop and show the file, the finding and the reason. A loosened rule usually means something else is broken.
2. **The writer doesn't do the rewrite.** Findings go to a second agent that didn't write the text, and the writer checks its diff for changed facts.

## The skill

`skills/prose-scrub/SKILL.md` is a Claude Code skill that runs the loop: scan, send the findings to a fresh subagent, rescan, then check the subagent's diff for changed facts. For Markdown it also runs the headings check. Copy it into your skills folder and fix the clone path inside if yours differs from `~/prose-scrub`:

```bash
mkdir -p ~/.claude/skills && cp -r skills/prose-scrub ~/.claude/skills/
```

## Development

```bash
bun test          # end-to-end: runs the CLI as a subprocess against test/fixtures
bun run typecheck
bun run build     # single binary in dist/
```

Tests are end-to-end only. A change to a rule or to parsing needs a test that fails on the old code. Every commit adds an entry to [CHANGELOG.md](CHANGELOG.md), and a test keeps this README, the changelog and AGENTS.md passing the gate.

## Sources

The phrase list, dash rules, pre-negation and the rhythm method come from the deslop skill. Several phrase and structure rules come from [stop-slop](https://github.com/hardikpandya/stop-slop) (MIT); see `src/data/NOTICE.md`. Scaffolded with [mkcmd-agent](https://github.com/mackenziebowes/mkcmd-agent).

## Licence

MIT. See `LICENSE`.
