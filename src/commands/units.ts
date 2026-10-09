import { defineCommand } from "../core/cli";
import { readOne } from "../lib/input";
import { units as split, type Paragraph } from "../lib/units";

export const units = defineCommand({
  name: "units",
  summary: "Split a file's prose into numbered paragraphs and sentences",
  description:
    "Prints the paragraphs rhythm counts (headings, list items, table cells, labels and code are left out), each split into sentences, with ids like p3 and p3.s2 and the line each starts on. judge scores these same units.",
  args: "<file>",
  flags: {
    stdin: { type: "boolean", description: "Read the text from stdin instead of a file" },
    as: { type: "string", default: "md", description: "Format of stdin text: md, mdx, html, txt, ts, tsx or js" },
  },
  examples: ["prose-scrub units post.md --json", "cat draft.md | prose-scrub units --stdin --json"],
  run: async ({ flags, args }) => {
    const { file, src, kind } = await readOne(args, flags, "prose-scrub units post.md --json");
    const paragraphs = split(src, kind);
    return { file, paragraphs, sentences: paragraphs.reduce((a, p) => a + p.sentences.length, 0) };
  },
  render: (r: { file: string; paragraphs: Paragraph[] }) =>
    [r.file, ...r.paragraphs.flatMap((p) => p.sentences.map((s) => `  ${String(s.line).padStart(4)}  ${s.id.padEnd(8)} ${s.text}`))].join("\n"),
});
