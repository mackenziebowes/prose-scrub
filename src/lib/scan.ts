import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { extract, kindOf, type Kind } from "./extract";
import { fileRules, lineRules, type Severity } from "./rules";

export type Finding = {
  file: string;
  line: number;
  col: number;
  rule: string;
  severity: Severity;
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
  errors: number;
  warnings: number;
};

export type ScanResult = {
  passed: boolean;
  strict: boolean;
  errors: number;
  warnings: number;
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
 * stdev / mean of sentence lengths, over sentences of 3+ words. Human prose sits around 0.6-1.2.
 * Only paragraph text counts: headings, list items and table rows aren't sentences.
 */
function burstiness(prose: string): { value: number | null; sentences: number } {
  const paragraphs = prose
    .split("\n")
    .filter((l) => !/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/.test(l))
    .join("\n");
  const lengths = paragraphs
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().split(" ").filter(Boolean).length)
    .filter((n) => n > 2);
  if (lengths.length < 8) return { value: null, sentences: lengths.length };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  return { value: Math.round((sd / mean) * 100) / 100, sentences: lengths.length };
}

export function scanText(label: string, text: string, kind: Kind, ignore: string[]): { report: FileReport; findings: Finding[] } {
  const ignored = (id: string) => ignore.some((x) => id === x || id.startsWith(`${x}.`));
  const prose = extract(text, kind);
  const proseLines = prose.split("\n");
  const rawLines = text.split("\n");
  const findings: Finding[] = [];

  for (const rule of lineRules) {
    if (ignored(rule.id)) continue;
    proseLines.forEach((line, i) => {
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
          severity: rule.severity,
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
  if (!ignored(flat.id) && rhythm.value !== null && rhythm.value < 0.6) {
    findings.push({
      file: label,
      line: 1,
      col: 1,
      rule: flat.id,
      severity: flat.severity,
      match: `burstiness ${rhythm.value}`,
      context: `${rhythm.sentences} sentences; human prose usually sits between 0.6 and 1.2`,
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
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
    },
    findings,
  };
}

export function summarize(parts: Array<{ report: FileReport; findings: Finding[] }>, strict: boolean): ScanResult {
  const findings = parts.flatMap((p) => p.findings);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return {
    passed: errors === 0 && (!strict || warnings === 0),
    strict,
    errors,
    warnings,
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
