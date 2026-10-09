import { defineCommand, UsageError } from "../core/cli";
import { kindOf } from "../lib/extract";
import { headings as parseHeadings, type Heading } from "../lib/headings";
import { collect, displayPath, readFile } from "../lib/scan";

type HeadingsResult = { files: Array<{ file: string; headings: Heading[] }> };

export const headings = defineCommand({
  name: "headings",
  summary: "List the headings of Markdown files, for a cheap importance review",
  description:
    "Prints every heading in each Markdown or MDX file, in order, with its depth and line. Headings in code blocks and front matter are left out. Meant as the input for a small model asked how important each section is made to sound: the gate can't measure over-importance, a reader can. Markdown only (.md .mdx .markdown and .md.txt templates).",
  args: "<file-or-dir...>",
  flags: {
    stdin: { type: "boolean", description: "Read Markdown from stdin instead of files" },
  },
  examples: ["prose-scrub headings post.md --json", "cat draft.md | prose-scrub headings --stdin --json"],
  run: async ({ flags, args, log }) => {
    if (flags.stdin) {
      if (args.length) throw new UsageError("Pass files or --stdin, not both.");
      return { files: [{ file: "<stdin>", headings: parseHeadings(await new Response(Bun.stdin.stream()).text(), false) }] };
    }
    if (!args.length) throw new UsageError("No files given.", "Example: prose-scrub headings post.md --json");
    const { files, unsupported, missing } = collect(args);
    if (missing.length) throw new UsageError(`Not found: ${missing.join(", ")}.`);
    const notMarkdown = [...unsupported, ...files.filter((f) => !["markdown", "mdx"].includes(kindOf(f)!)).map(displayPath)];
    if (notMarkdown.length) throw new UsageError(`Not Markdown: ${notMarkdown.join(", ")}.`, "headings reads .md, .mdx, .markdown and .md.txt files only.");
    if (!files.length) throw new UsageError("No Markdown files found in the given directories.");
    log(`read ${files.length} file${files.length === 1 ? "" : "s"}`);
    return { files: files.map((f) => ({ file: displayPath(f), headings: parseHeadings(readFile(f), kindOf(f) === "mdx") })) };
  },
  render: (r: HeadingsResult) =>
    r.files.map((f) => [f.file, ...f.headings.map((h) => `  ${String(h.line).padStart(4)}  ${"#".repeat(h.depth)} ${h.text}`)].join("\n")).join("\n\n"),
});
