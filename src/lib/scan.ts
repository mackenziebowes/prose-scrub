import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { extractViews, kindOf, type Kind } from "./extract";
import { fileRules, lineRules } from "./rules";

export type Finding = {
  file: string;
  line: number;
  col: number;
  rule: string;
  match: string;
  context: string;
  fix: string;
};

export type FileReport = {
  file: string;
  kind: Kind;
  words: number;
  sentences: number;
  burstiness: number | null;
  findings: number;
};

export type ScanResult = {
  passed: boolean;
  /** Number of findings. Every finding fails the gate. */
  count: number;
  files: FileReport[];
  findings: Finding[];
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", "build", ".next", ".vinext", ".cloudflare", ".wrangler", "coverage"]);

/** Expand files and directories into supported files. Unsupported explicit files are returned separately. */
export function collect(inputs: string[]): { files: string[]; unsupported: string[]; missing: string[] } {
  const files: string[] = [];
  const unsupported: string[] = [];
  const missing: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (kindOf(p)) files.push(p);
    }
  };
  for (const input of inputs) {
    if (!existsSync(input)) missing.push(input);
    else if (statSync(input).isDirectory()) walk(input);
    else if (kindOf(input)) files.push(input);
    else unsupported.push(input);
  }
  return { files, unsupported, missing };
}

/**
 * stdev / mean of sentence lengths, over sentences of 3+ words, scored from 5 sentences up: the
 * same method and thresholds as the deslop skill's burstiness.py. Human prose sits around 0.6-1.2.
 */
function burstiness(prose: string): { value: number | null; sentences: number } {
  const lengths = prose
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().split(" ").filter(Boolean).length)
    .filter((n) => n > 2);
  if (lengths.length < 5) return { value: null, sentences: lengths.length };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  return { value: Math.round((sd / mean) * 100) / 100, sentences: lengths.length };
}

export function scanText(label: string, text: string, kind: Kind, ignore: string[]): { report: FileReport; findings: Finding[] } {
  const ignored = (rule: { id: string; ignorable: boolean }) =>
    rule.ignorable && ignore.some((x) => rule.id === x || rule.id.startsWith(`${x}.`));
  const { prose, chars } = extractViews(text, kind);
  const views = { prose: prose.split("\n"), chars: chars.split("\n") };
  const rawLines = text.split("\n");
  const findings: Finding[] = [];

  for (const rule of lineRules) {
    if (ignored(rule)) continue;
    views[rule.scope].forEach((line, i) => {
      if (!line.trim()) return;
      for (const m of line.matchAll(rule.pattern)) {
        const col = m.index! + 1 + (m[0].length - m[0].trimStart().length);
        const raw = rawLines[i] ?? "";
        const from = Math.max(0, col - 50);
        findings.push({
          file: label,
          line: i + 1,
          col,
          rule: rule.id,
          match: m[0].trim(),
          context: `${from > 0 ? "..." : ""}${raw.slice(from, col + 70).trim()}${col + 70 < raw.length ? "..." : ""}`,
          fix: rule.fix,
        });
      }
    });
  }

  const words = (prose.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  const rhythm = burstiness(prose);
  const flat = fileRules[0]!;
  if (!ignored(flat) && rhythm.value !== null && rhythm.value < 0.6) {
    findings.push({
      file: label,
      line: 1,
      col: 1,
      rule: flat.id,
      match: `burstiness ${rhythm.value}`,
      context: `${rhythm.sentences} sentences; human prose usually sits between 0.6 and 1.2${rhythm.value < 0.4 ? " (under 0.4: strong tell)" : ""}`,
      fix: flat.fix,
    });
  }

  findings.sort((a, b) => a.line - b.line || a.col - b.col);
  return {
    report: {
      file: label,
      kind,
      words,
      sentences: rhythm.sentences,
      burstiness: rhythm.value,
      findings: findings.length,
    },
    findings,
  };
}

export function summarize(parts: Array<{ report: FileReport; findings: Finding[] }>): ScanResult {
  const findings = parts.flatMap((p) => p.findings);
  return {
    passed: findings.length === 0,
    count: findings.length,
    files: parts.map((p) => p.report),
    findings,
  };
}

export function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function displayPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") ? rel : path;
}
