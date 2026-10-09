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

test("TSX: JSX text is checked, imports and class names are not", async () => {
  const { stdout } = await run(["scan", join(FIX, "Page.tsx"), "--json"]);
  const findings = JSON.parse(stdout).error.details.findings;
  expect(ids(findings)).toEqual(["dash.em"]);
  expect(findings[0].line).toBe(6);
});

test("directories recurse and skip node_modules", async () => {
  const { stdout } = await run(["scan", join(FIX, "site"), "--json"]);
  const r = JSON.parse(stdout);
  const out = r.ok ? r.result : r.error.details;
  expect(out.files.map((f: { file: string }) => f.file.split("/").pop())).toEqual(["notes.md"]);
  expect(ids(out.findings)).toEqual(["structure.pre-negation"]);
});

test("warnings pass by default and fail with --strict", async () => {
  const loose = await run(["scan", join(FIX, "site", "notes.md"), "--json"]);
  expect(loose.code).toBe(0);
  const strict = await run(["scan", join(FIX, "site", "notes.md"), "--strict", "--json"]);
  expect(strict.code).toBe(1);
  expect(JSON.parse(strict.stdout).error.message).toContain("--strict");
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
  expect(stdout).toContain('3:71  error    dash.em  "—"');
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

test("describe lists scan and rules", async () => {
  const { stdout } = await run(["describe"]);
  expect(JSON.parse(stdout).commands.map((c: { name: string }) => c.name)).toEqual(["scan", "rules"]);
});

test("flat prose is flagged even when headings and lists surround it", async () => {
  const { code, stdout } = await run(["scan", join(FIX, "flat.md"), "--strict", "--json"]);
  expect(code).toBe(1);
  const flat = JSON.parse(stdout).error.details.findings.find((f: { rule: string }) => f.rule === "rhythm.flat");
  expect(flat).toBeDefined();
});
