import { expect, test } from "bun:test";
import { join } from "node:path";

const FIX = join(import.meta.dir, "fixtures");

const run = async (args: string[], stdin?: string) => {
  const proc = Bun.spawn(["bun", "src/index.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
};
const ids = (findings: Array<{ rule: string }>) => findings.map((f) => f.rule);

test("a sloppy draft fails with exit 1 and every finding in error.details", async () => {
  const { code, stdout } = await run(["scan", join(FIX, "sloppy.md"), "--json"]);
  expect(code).toBe(1);
  const r = JSON.parse(stdout);
  expect(r.ok).toBe(false);
  expect(r.error.code).toBe("slop_found");
  const found = ids(r.error.details.findings);
  for (const id of ["phrase.filler", "dash.em", "phrase.stock", "phrase.throat-clearing", "quote.curly", "ellipsis.char", "structure.pre-negation", "structure.trailing-participle", "structure.connector-opener", "word.corporate"]) {
    expect(found).toContain(id);
  }
  const dash = r.error.details.findings.find((f: { rule: string }) => f.rule === "dash.em");
  expect([dash.line, dash.col]).toEqual([3, 71]);
});

test("code blocks, inline code, blockquotes and --flags in prose are left alone", async () => {
  const { stdout } = await run(["scan", join(FIX, "sloppy.md"), "--json"]);
  const lines = JSON.parse(stdout).error.details.findings.map((f: { line: number }) => f.line);
  expect(lines.every((l: number) => l <= 5)).toBe(true);
});

test("a clean file passes with exit 0", async () => {
  const { code, stdout } = await run(["scan", join(FIX, "clean.md"), "--json"]);
  expect(code).toBe(0);
  const r = JSON.parse(stdout);
  expect(r.result.passed).toBe(true);
  expect(r.result.findings).toEqual([]);
});

test("HTML: entities count, scripts, styles and pre blocks don't", async () => {
  const { stdout } = await run(["scan", join(FIX, "page.html"), "--json"]);
  const findings = JSON.parse(stdout).error.details.findings;
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({ rule: "dash.em", match: "&mdash;", line: 4 });
});

test("TSX: JSX text and short labels are checked, imports and class names are not", async () => {
  const { stdout } = await run(["scan", join(FIX, "Page.tsx"), "--json"]);
  const findings = JSON.parse(stdout).error.details.findings;
  expect(findings.map((f: { rule: string; line: number }) => [f.rule, f.line])).toEqual([
    ["dash.em", 6],
    ["dash.em", 8],
  ]);
});

test("directories recurse and skip node_modules", async () => {
  const { stdout } = await run(["scan", join(FIX, "site"), "--json"]);
  const r = JSON.parse(stdout);
  const out = r.ok ? r.result : r.error.details;
  expect(out.files.map((f: { file: string }) => f.file.split("/").pop())).toEqual(["notes.md"]);
  expect(ids(out.findings)).toEqual(["structure.pre-negation"]);
});

test("every finding fails the gate", async () => {
  const { code, stdout } = await run(["scan", join(FIX, "site", "notes.md"), "--json"]);
  expect(code).toBe(1);
  expect(ids(JSON.parse(stdout).error.details.findings)).toEqual(["structure.pre-negation"]);
});

test("pre-negation can't be ignored, by id or by prefix", async () => {
  const byId = await run(["scan", join(FIX, "site", "notes.md"), "--ignore", "structure.pre-negation", "--json"]);
  expect(byId.code).toBe(2);
  expect(JSON.parse(byId.stdout).error.message).toContain("can't be ignored");
  const byPrefix = await run(["scan", join(FIX, "site", "notes.md"), "--ignore", "structure", "--json"]);
  expect(byPrefix.code).toBe(1);
  expect(ids(JSON.parse(byPrefix.stdout).error.details.findings)).toEqual(["structure.pre-negation"]);
});

test("--ignore skips rules by id or prefix", async () => {
  const { stdout } = await run(["scan", join(FIX, "sloppy.md"), "--ignore", "dash,quote.curly,word", "--json"]);
  const found = ids(JSON.parse(stdout).error.details.findings);
  expect(found.some((id: string) => id.startsWith("dash.") || id === "quote.curly" || id.startsWith("word."))).toBe(false);
  expect(found).toContain("phrase.stock");
});

test("--stdin scans piped text", async () => {
  const { code, stdout } = await run(["scan", "--stdin", "--json"], "We delve into it — fast.");
  expect(code).toBe(1);
  expect(ids(JSON.parse(stdout).error.details.findings)).toEqual(["word.corporate", "dash.em"]);
});

test("people get the report on stdout and the verdict on stderr", async () => {
  const { code, stdout, stderr } = await run(["scan", join(FIX, "sloppy.md")]);
  expect(code).toBe(1);
  expect(stdout).toContain('3:71  dash.em  "—"');
  expect(stderr).toContain("error: Found");
});

test("bad input is a usage error", async () => {
  for (const args of [["scan", "--json"], ["scan", join(FIX, "data.csv"), "--json"], ["scan", "nope.md", "--json"]]) {
    const { code, stdout } = await run(args);
    expect(code).toBe(2);
    expect(JSON.parse(stdout).error.code).toBe("usage");
  }
});

test("rules lists every rule with a fix", async () => {
  const { code, stdout } = await run(["rules", "--json"]);
  expect(code).toBe(0);
  const r = JSON.parse(stdout).result;
  expect(r.stockPhrases).toBeGreaterThan(50);
  expect(r.rules.every((x: { fix: string }) => x.fix.length > 0)).toBe(true);
  expect(r.rules.map((x: { id: string }) => x.id)).toContain("rhythm.flat");
});

test("describe lists every command", async () => {
  const { stdout } = await run(["describe"]);
  expect(JSON.parse(stdout).commands.map((c: { name: string }) => c.name)).toEqual(["scan", "rules", "headings", "units", "judge"]);
});

test("flat prose is flagged even when headings and lists surround it", async () => {
  const { code, stdout } = await run(["scan", join(FIX, "flat.md"), "--json"]);
  expect(code).toBe(1);
  const flat = JSON.parse(stdout).error.details.findings.find((f: { rule: string }) => f.rule === "rhythm.flat");
  expect(flat).toBeDefined();
});

// Parsing: every rule sees real text blocks from a real parser.
const P = join(FIX, "parsed");
const report = (stdout: string) => {
  const r = JSON.parse(stdout);
  return r.ok ? r.result : r.error.details;
};

test("Markdown: rhythm counts paragraph sentences only, never headings, list items, cells or code", async () => {
  const { stdout } = await run(["scan", join(P, "rhythm.md"), "--json"]);
  const r = report(stdout);
  expect(r.files[0].sentences).toBe(5);
  expect(r.findings.map((f: { rule: string; line: number }) => [f.rule, f.line])).toEqual([["dash.em", 3]]);
});

test("Markdown: a phrase that wraps onto the next line is still found", async () => {
  const { code, stdout } = await run(["scan", join(P, "wrapped.md"), "--json"]);
  expect(code).toBe(1);
  const f = JSON.parse(stdout).error.details.findings;
  expect(f.map((x: { rule: string; line: number; col: number }) => [x.rule, x.line, x.col])).toEqual([["structure.pre-negation", 1, 32]]);
});

test("Markdown templates (.md.txt) are parsed as Markdown, so their code blocks are skipped", async () => {
  const { code, stdout } = await run(["scan", join(P, "AGENTS.md.txt"), "--json"]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout).result.files[0].kind).toBe("markdown");
});

test("HTML: entities are decoded for phrase rules; alt text and meta descriptions are checked; blockquotes aren't", async () => {
  const { stdout } = await run(["scan", join(P, "page.html"), "--json"]);
  const f = report(stdout).findings.map((x: { rule: string; line: number }) => [x.rule, x.line]);
  expect(f).toEqual([
    ["dash.em", 2],
    ["structure.pre-negation", 4],
    ["dash.em", 5],
  ]);
});

test("TSX: escapes are decoded; types, directives, class lists, styles and command props are skipped; rhythm reads paragraphs, not labels", async () => {
  const { stdout } = await run(["scan", join(P, "Labels.tsx"), "--json"]);
  const r = report(stdout);
  expect(r.findings.map((x: { rule: string; line: number; col: number }) => [x.rule, x.line, x.col])).toEqual([["dash.em", 7, 25]]);
  expect(r.files[0].sentences).toBe(5);
});

test("MDX: imports, exports, JSX and expressions are skipped", async () => {
  const { code, stdout } = await run(["scan", join(P, "post.mdx"), "--json"]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout).result.files[0].kind).toBe("mdx");
});

// Prose for readers is gated; instructions for agents (AGENTS.md, the skill) aren't.
test("the repo's own README and CHANGELOG pass the gate", async () => {
  const { code, stdout } = await run(["scan", "README.md", "CHANGELOG.md", "--json"]);
  const r = JSON.parse(stdout);
  expect(r.ok ? [] : r.error.details?.findings ?? r.error).toEqual([]);
  expect(code).toBe(0);
});

test("headings lists every Markdown heading in order, and nothing else", async () => {
  const { code, stdout } = await run(["headings", join(FIX, "headings.md"), "--json"]);
  expect(code).toBe(0);
  const r = JSON.parse(stdout);
  expect(r.ok).toBe(true);
  expect(r.result.files[0].headings).toEqual([
    { depth: 1, text: "The title", line: 5 },
    { depth: 2, text: "Where it started", line: 9 },
    { depth: 3, text: "inline code and a link", line: 15 },
    { depth: 2, text: "Setext heading", line: 17 },
  ]);
});

test("headings reads Markdown only and says so for anything else", async () => {
  const { code, stdout } = await run(["headings", join(FIX, "clean.md"), "src/index.ts", "--json"]);
  expect(code).toBe(2);
  expect(JSON.parse(stdout).error.message).toContain("src/index.ts");
});

test("headings reads stdin", async () => {
  const { code, stdout } = await run(["headings", "--stdin", "--json"], "# One\n\ntext\n\n## Two\n");
  expect(code).toBe(0);
  expect(JSON.parse(stdout).result.files[0].headings.map((h: { text: string }) => h.text)).toEqual(["One", "Two"]);
});

test("units numbers paragraphs and sentences, with lines, and skips headings", async () => {
  const { code, stdout } = await run(["units", join(FIX, "judge.md"), "--json"]);
  expect(code).toBe(0);
  const r = JSON.parse(stdout).result;
  expect(r.paragraphs.map((p: { id: string; line: number }) => [p.id, p.line])).toEqual([["p1", 3], ["p2", 5], ["p3", 7]]);
  expect(r.paragraphs[0].sentences.map((s: { id: string; text: string }) => [s.id, s.text])).toEqual([
    ["p1.s1", "The Hallam Street bridge is 40 metres long."],
    ["p1.s2", "It opened in March 1932 and cost the council £18,000."],
    ["p1.s3", "Trams crossed it until 1961."],
  ]);
  expect(r.sentences).toBe(8);
});

const runEnv = async (args: string[], env: Record<string, string | undefined>) => {
  const proc = Bun.spawn(["bun", "src/index.ts", ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
  return { code: await proc.exited, stdout: await new Response(proc.stdout).text() };
};

test("judge without an API key is exit 2 with a hint that never asks for the key on the command line", async () => {
  const { code, stdout } = await runEnv(["judge", join(FIX, "judge.md"), "--json"], { ANTHROPIC_API_KEY: "", PROSE_SCRUB_KEYCHAIN_SERVICE: "prose-scrub-test-no-such-item" });
  expect(code).toBe(2);
  const e = JSON.parse(stdout).error;
  expect(e.code).toBe("no_api_key");
  expect(e.hint).toContain("-w");
});

test("judge rejects bad --runs and unknown rankings before calling anything", async () => {
  expect((await run(["judge", join(FIX, "judge.md"), "--runs", "0", "--json"])).code).toBe(2);
  expect((await run(["judge", join(FIX, "judge.md"), "--rankings", "vibes", "--json"])).code).toBe(2);
});

// Calls the real API. Runs only when a key is available (ANTHROPIC_API_KEY or the macOS Keychain).
const hasKey = !!process.env.ANTHROPIC_API_KEY || (process.platform === "darwin" && Bun.spawnSync(["security", "find-generic-password", "-s", process.env.PROSE_SCRUB_KEYCHAIN_SERVICE ?? "anthropic-api-key"]).exitCode === 0);
test.skipIf(!hasKey)("judge flags the inflated paragraph and the empty sentences, and leaves the facts alone", async () => {
  const { code, stdout } = await run(["judge", join(FIX, "judge.md"), "--runs", "3", "--json"]);
  expect(code).toBe(0);
  const r = JSON.parse(stdout).result;
  const byRanking = Object.fromEntries(r.results.map((x: { ranking: string }) => [x.ranking, x]));
  for (const x of r.results) expect(x.runs.complete).toBe(3);
  const flagged = (id: string) => byRanking[id].units.filter((u: { flagged: boolean }) => u.flagged).map((u: { id: string }) => u.id);
  expect(flagged("significance")).toEqual(["p2"]);
  expect(flagged("superficial")).toContain("p2.s1");
  expect(flagged("superficial")).toContain("p3.s3");
  expect(flagged("superficial").filter((id: string) => id.startsWith("p1"))).toEqual([]);
}, 120000);

test("copula avoidance: serves as, stood as, boasts and functions as are flagged; plain verbs aren't", async () => {
  const { code, stdout } = await run(["scan", join(FIX, "copula.md"), "--json"]);
  expect(code).toBe(1);
  const hits = JSON.parse(stdout).error.details.findings.filter((f: { rule: string }) => f.rule === "word.copula-avoidance");
  expect(hits.map((f: { line: number; match: string }) => [f.line, f.match])).toEqual([
    [1, "serves as"],
    [3, "stood as"],
    [5, "boasts"],
    [7, "functions as"],
  ]);
});

