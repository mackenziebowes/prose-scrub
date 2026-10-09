import { defineCommand, CliError, UsageError } from "../core/cli";
import { kindOf, type Kind } from "../lib/extract";
import { lineRules } from "../lib/rules";
import { collect, displayPath, readFile, scanText, summarize, type ScanResult } from "../lib/scan";

const KINDS: Record<string, Kind> = { md: "markdown", markdown: "markdown", html: "html", tsx: "source", ts: "source", txt: "text", text: "text" };

export const scan = defineCommand({
  name: "scan",
  summary: "Scan files for AI writing tells; exits 1 on any finding",
  description:
    "Checks Markdown, HTML, plain text, and the prose inside TS/TSX string literals. Code blocks, inline code, URLs, blockquotes, scripts and class names are skipped. Directories are scanned recursively (node_modules, .git and build output excluded). Every finding fails the gate. structure.pre-negation can't be ignored.",
  args: "<file-or-dir...>",
  flags: {
    ignore: {
      type: "string",
      description: "Comma-separated rule ids or prefixes to skip, e.g. word.adverb. structure.pre-negation is always enforced.",
    },
    stdin: { type: "boolean", description: "Read the text from stdin instead of files" },
    as: { type: "string", default: "md", description: "Format of stdin text: md, html, txt or tsx" },
  },
  examples: [
    "prose-scrub scan README.md docs/ --json",
    "prose-scrub scan site/app --ignore rhythm.flat",
    "cat draft.md | prose-scrub scan --stdin --json",
  ],
  run: async ({ flags, args, log }) => {
    const ignore = (flags.ignore ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const forbidden = ignore.filter((x) => lineRules.some((r) => !r.ignorable && r.id === x));
    if (forbidden.length) {
      throw new UsageError(`${forbidden.join(", ")} can't be ignored.`, "Pre-negation is forbidden. Rewrite the sentence: keep the claim, drop the negated half.");
    }
    const parts = [];

    if (flags.stdin) {
      const kind = KINDS[flags.as];
      if (!kind) throw new UsageError(`Unknown --as "${flags.as}".`, "Use md, html, txt or tsx.");
      if (args.length) throw new UsageError("Pass files or --stdin, not both.");
      parts.push(scanText("<stdin>", await new Response(Bun.stdin.stream()).text(), kind, ignore));
    } else {
      if (!args.length) throw new UsageError("No files given.", "Example: prose-scrub scan README.md docs/ --json");
      const { files, unsupported, missing } = collect(args);
      if (missing.length) throw new UsageError(`Not found: ${missing.join(", ")}.`);
      if (unsupported.length) {
        throw new UsageError(
          `Can't scan ${unsupported.join(", ")}.`,
          "Supported: .md .mdx .html .htm .txt .ts .tsx .js .jsx .mjs. For anything else, pipe it in with --stdin --as txt.",
        );
      }
      if (!files.length) throw new UsageError("No supported files found in the given directories.");
      for (const file of files) parts.push(scanText(displayPath(file), readFile(file), kindOf(file)!, ignore));
      log(`scanned ${files.length} file${files.length === 1 ? "" : "s"}`);
    }

    const result = summarize(parts);
    if (!result.passed) {
      throw new CliError(`Found ${result.count} problem${result.count === 1 ? "" : "s"}.`, {
        code: "slop_found",
        hint: "Fix every finding in the text. `prose-scrub rules --json` explains each rule and its fix.",
        details: result,
      });
    }
    return result;
  },
  render: (r: ScanResult) => {
    const lines: string[] = [];
    let current = "";
    for (const f of r.findings) {
      if (f.file !== current) {
        if (current) lines.push("");
        lines.push(f.file);
        current = f.file;
      }
      lines.push(`  ${f.line}:${f.col}  ${f.rule}  "${f.match}"`);
      lines.push(`      ${f.context}`);
    }
    if (r.findings.length) lines.push("");
    const words = r.files.reduce((a, f) => a + f.words, 0);
    lines.push(
      `${r.passed ? "clean" : "slop found"}: ${r.count} problem${r.count === 1 ? "" : "s"} in ${r.files.length} file${r.files.length === 1 ? "" : "s"} (${words} words)`,
    );
    return lines.join("\n");
  },
});
