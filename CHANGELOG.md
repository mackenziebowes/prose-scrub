# Changelog

One entry per commit, newest first, written for the people and agents who run the gate: each entry says what changed and what it does to your results.

## 0.3.0

### 2026-10-09: headings command and an importance check in the skill

`prose-scrub headings <file.md> --json` prints the headings of a Markdown or MDX file in order, with depth and line. The parser decides what a heading is, so a `##` line inside a code block or front matter isn't one. Other file types are a usage error (exit 2). The scan and its rules don't change.

The skill now has an advisory step for Markdown. Once the gate passes, it sends the headings to a Haiku subagent, which scores how important each one is made to sound. If most score 0.8 or more, the user gets the scores. Sending a short list instead of the whole file keeps the check cheap.

## 0.2.0

### 2026-10-08: Public, with the skill and an MIT licence

prose-scrub is now on GitHub under the MIT licence. The Claude Code skill that runs the rewrite loop ships in `skills/prose-scrub/SKILL.md`, with install steps in the README. The skill's paths point at a clone instead of one machine. The self-check test now scans the skill too.

### 2026-10-08: README, changelog, and the agents-only framework

The README now explains what the gate reads, what each rule family catches, the exit codes, and the two rules for using it. This changelog starts here, with entries written back to the first commit.

The command framework now matches mkcmd-agent 0.2.0, which has no prompts. `--no-input` is gone; passing it is now a usage error (exit 2). AGENTS.md was regenerated to match and now asks every commit to add a changelog entry, and a new test scans README.md, CHANGELOG.md and AGENTS.md and fails if they don't pass.

### 2026-10-08: Rhythm: a block must end like a sentence to count

Labels such as "FIG. A · LEARN THE CLI" and "Command name, e.g. sync" were counted as sentences, because a period anywhere in the text was enough. Now a block has to end with `.`, `!` or `?` to count toward rhythm. Leaving the labels out made scores flatter, not kinder. On the résumé, mkcmd-agent and personal-site, rhythm flagged 20 files instead of 16. No other rule changed.

### 2026-10-08: Parse files instead of masking them with regexes

Until this commit, prose-scrub found prose by blanking out whatever looked like code with regular expressions. That broke rhythm in particular. In TSX it counted CSS values and terminal commands as sentences, and in Markdown it glued each heading onto the sentence after it. Now each format goes through a real parser. Markdown and MDX use mdast, HTML uses parse5, and TS, TSX and JS use the TypeScript compiler.

What changes for you:

- A phrase that wraps onto the next line is found. Before, rules ran one line at a time.
- HTML entities are decoded before phrase rules run, so `it&#39;s not a tool, it&#39;s a movement` is caught. JS escapes like `"—"` count as the dash they print.
- Alt text, meta descriptions and front matter titles and descriptions are checked.
- Types, `"use client"`, class lists, styles and imports are skipped because the parser says what they are, not because of a guess about the string.
- `.md.txt` templates parse as Markdown, so their code blocks are skipped.
- "Moreover," and the other connectors are caught at the start of any sentence, not only at the start of a line.
- Rhythm is measured per paragraph. Headings, list items, table cells and code are left out.

That last item reverses part of an earlier commit, "Revert the rhythm relaxation", which kept list items in. The reasons for doing it anyway: deslop's `burstiness.py`, the reference this rule follows, deletes headings, list items and table rows before it measures, so the parser now matches the reference. It also didn't let anything through. Run against the old extractor on the résumé, mkcmd-agent and personal-site, no rule found fewer problems and rhythm flagged 16 files instead of 10; the mkcmd-agent README, the file the earlier relaxation had passed, still fails at 0.52.

TypeScript is pinned to 6.x. TypeScript 7 is the native Go port. Its npm package ships no JavaScript compiler API.

## 0.1.0

### 2026-10-08: Hint: fix the text, don't reach for --ignore

When a scan fails, the hint now says to fix every finding in the text and points to `rules --json` for the fixes. It no longer suggests `--ignore`.

### 2026-10-08: Every rule is fatal; pre-negation can't be ignored; short strings checked

There is no warning tier and no `--strict`. Any finding fails the gate, because agents in a rewrite loop need a yes or a no. `structure.pre-negation` is forbidden outright. Passing it to `--ignore` is a usage error, and ignoring the `structure` prefix still leaves it on. Dash, quote and ellipsis rules now see every string in TS and TSX, however short; a 12-character minimum had been hiding labels like `Next —`.

### 2026-10-08: Revert the rhythm relaxation; match deslop's burstiness.py

The first real scan flagged flat rhythm in writing by the agent that built the tool, and that agent changed the measurement until its own README passed. This commit put the measurement back to deslop's method, with its minimum of five sentences instead of eight, and added a test that fails on the relaxed code. It's why the gate's first rule is that nobody loosens a rule to get text through.

### 2026-10-08: Rename scrub to prose-scrub

The name says what it scrubs.

### 2026-10-08: scrub: a deslop gate for prose

The first version. `scan` checks Markdown, HTML, plain text and the strings in TS and TSX for em dashes, curly quotes, stock phrases, pre-negation, filler and flat rhythm. It exits 1 with every finding in `error.details`. The rules come from the deslop skill and from stop-slop (MIT, see `src/data/NOTICE.md`). Scaffolded with mkcmd-agent.
