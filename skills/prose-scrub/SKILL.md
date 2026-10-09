---
name: prose-scrub
description: "Gate prose for AI writing tells with the prose-scrub CLI, and run the rewrite loop through a fresh subagent until it passes. Use before publishing or shipping any prose: READMEs, docs, sites, résumés, posts, emails, PR descriptions, commit messages. Also use when the user says 'scrub', 'prose-scrub', 'run the gate', or asks whether something reads like AI."
metadata:
  version: 1.2.0
---

# prose-scrub

**Goal: prose that passes the gate, rewritten by someone other than its author.**

## Two rules that override everything else

1. **The session that wrote a piece of text never rewrites it.** Not for rhythm, not for one
   dash, not for "a quick fix". Every rewrite goes to a fresh subagent that did not write the
   text. An author can't see its own tells; a second reader can.
2. **Never relax the gate to make text pass.** Don't loosen a rule, a threshold, a regex or the
   parsing, and don't add `--ignore` to get something through. If a rule looks wrong, stop and
   tell the user with evidence: the file, the finding and why you think the rule misfires.
   Relaxing a rule is an alarm: it usually means the rules are under-enforced, unclear or
   incorrect, or something else is broken, and the user needs to step in.

## The tool

Install once: `git clone https://github.com/mackenziebowes/prose-scrub ~/prose-scrub && cd ~/prose-scrub && bun install`.
Adjust `~/prose-scrub` below to wherever you cloned it. Write the full command every time; agent
shells don't keep aliases.

```bash
bun ~/prose-scrub/src/index.ts scan <files-or-dirs...> --json
bun ~/prose-scrub/src/index.ts scan --stdin --as md --json < draft.md
bun ~/prose-scrub/src/index.ts rules --json
bun ~/prose-scrub/src/index.ts headings <file.md> --json
```

- Exit 0: clean. Exit 1 (`slop_found`): findings in `error.details.findings`, each with `file`,
  `line`, `col`, `rule`, `match`, `context`, `fix`. Exit 2: bad input.
- Every finding fails the gate. There are no warnings.
- `structure.pre-negation` (`it's not X, it's Y`) is forbidden. `--ignore` can't skip it.
- Parses .md .mdx (GFM, front matter) and .md.txt templates, .html .htm, .txt, and .ts .tsx .js
  .jsx .mjs (JSX text and string literals, via the TypeScript compiler). Code blocks, inline code,
  URLs, blockquotes, scripts, styles, imports, types and class names are skipped. Alt text, meta
  descriptions and front matter titles and descriptions are checked.
- Rhythm (`rhythm.flat`) is measured over paragraphs only: headings, list items, table cells and
  labels (text that doesn't end like a sentence) don't count. The `sentences` field per file in
  the report says how many sentences were measured.

## The loop

1. **Scan** the target with `--json`.
2. **Clean:** report one line and stop.
3. **Findings:** spawn a fresh subagent (one that has not seen the drafting) with:
   - the file path and the full findings JSON;
   - the instruction to fix every finding by editing the file: cut rather than pad, keep every
     fact, claim, number and the author's voice, never invent specifics, don't lengthen, and never
     restore a negation (if you have a deslop-style editing skill, point the subagent at it);
   - for `rhythm.flat`: vary sentence length concretely (split, merge, put a short sentence next to
     a long one) without changing what is said. Edit for how it reads, then rescan; never search
     over combinations of edits for the set that just clears the threshold. That optimises for
     the number, not the reader;
   - off limits: quotations, code, URLs, names and figures. If a finding sits in off-limits text,
     the subagent reports it instead of editing;
   - a request to report each change as before -> after, and anything it couldn't fix.
4. **Rescan.** Repeat from 3 with a new subagent, up to 3 rounds.
5. **Still failing after 3 rounds, or the subagent says a fix would change a fact:** stop and give
   the user the remaining findings. Don't push it through.
6. **Verify the diff yourself** (read only): facts, numbers, names and links unchanged; nothing
   added that the source didn't support. Revert any change that fails this and report it.

## Importance check (Markdown only, advisory)

The gate can't tell when every section is written up as the main event, and Wikipedia's guide
to signs of AI writing lists undue emphasis on significance as a tell. For a Markdown post or doc
with three or more headings, once the gate passes:

1. `bun ~/prose-scrub/src/index.ts headings <file.md> --json` prints `result.files[].headings`, each
   `{depth, text, line}`, in order. It reads .md, .mdx, .markdown and .md.txt files only.
2. Spawn a Haiku subagent and paste the headings array into its prompt. Don't hand it the file or
   ask it to read anything: the short input is what keeps this cheap. Ask it to score each heading
   from 0.0 to 1.0 on "How important does the author want me to think this section is?" and to
   reply with JSON only, `[{"text": ..., "score": ...}]`.
3. If most headings score 0.8 or more, the headings oversell. Give the user the scores and the
   highest-scoring headings. Don't rewrite them yourself; if the user wants changes, they go to a
   fresh subagent like any other rewrite.

## Changing the rules

Rules live in `src/lib/rules.ts` in the clone. Only change them when the user asks. Tests are
end-to-end only (`bun test` runs the CLI as a subprocess), and a new rule or fix needs a test that
fails on the old code.
