// Split a file's prose into numbered paragraphs and sentences, with the line each starts on, so
// every judge run scores exactly the same pieces. Paragraphs are the blocks rhythm counts:
// headings, list items, table cells, labels and code aren't units.

import { extract, view, type Kind } from "./extract";

export type Sentence = { id: string; line: number; text: string };
export type Paragraph = { id: string; line: number; text: string; sentences: Sentence[] };

export function units(src: string, kind: Kind): Paragraph[] {
  const lineAt = lineIndex(src);
  const out: Paragraph[] = [];
  for (const block of extract(src, kind)) {
    if (!block.rhythm) continue;
    const v = view(src, block, "prose");
    const pid = `p${out.length + 1}`;
    const sentences: Sentence[] = [];
    // Same split as the rhythm rule: after . ! or ? followed by whitespace.
    const re = /\S[\s\S]*?(?:[.!?]['"”’)\]]*(?=\s|$)|$)/g;
    for (const m of v.text.matchAll(re)) {
      const text = m[0].replace(/\s+/g, " ").trim();
      if (!text) continue;
      sentences.push({ id: `${pid}.s${sentences.length + 1}`, line: lineAt(v.at[m.index!] ?? 0), text });
    }
    if (!sentences.length) continue;
    out.push({ id: pid, line: sentences[0]!.line, text: sentences.map((s) => s.text).join(" "), sentences });
  }
  return out;
}

function lineIndex(src: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
