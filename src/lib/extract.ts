// Turn a file into "prose only": same length and same line breaks, with everything that
// isn't prose (code, markup, URLs, quotations) replaced by spaces. Rules then run on the
// result, so every line:column they report points at the original file.

export type Kind = "markdown" | "html" | "source" | "text";

export function kindOf(path: string): Kind | null {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (["md", "mdx", "markdown"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "html";
  if (["ts", "tsx", "js", "jsx", "mjs"].includes(ext)) return "source";
  if (["txt", "text"].includes(ext)) return "text";
  return null;
}

/** Replace a span with spaces, keeping newlines so line numbers don't move. */
function blank(s: string): string {
  return s.replace(/[^\n]/g, " ");
}

function mask(text: string, re: RegExp): string {
  return text.replace(re, (m) => blank(m));
}

/** Keep only the regions matched by `keep`; blank everything else. */
function keepOnly(text: string, ranges: Array<[number, number]>): string {
  const out = blank(text).split("");
  for (const [start, end] of ranges) for (let i = start; i < end; i++) out[i] = text[i]!;
  return out.join("");
}

export function extractMarkdown(text: string): string {
  let t = text;
  t = t.replace(/^---\n[\s\S]*?\n---\n/, (m) => blank(m)); // front matter
  t = mask(t, /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm); // fenced code
  t = mask(t, /<!--[\s\S]*?-->/g); // comments
  t = mask(t, /^ {0,3}>[^\n]*$/gm); // blockquotes: other people's words
  t = mask(t, /`[^`\n]+`/g); // inline code
  t = mask(t, /\]\([^)\n]*\)/g); // link targets (keep the link text)
  t = mask(t, /<[^>\n]+>/g); // inline HTML tags
  t = mask(t, /https?:\/\/\S+/g); // bare URLs
  t = mask(t, /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/gm); // table rules
  return t;
}

export function extractHtml(text: string): string {
  let t = text;
  t = mask(t, /<!--[\s\S]*?-->/g);
  t = mask(t, /<(script|style|pre|code|svg|template)\b[\s\S]*?<\/\1>/gi);
  t = mask(t, /<blockquote\b[\s\S]*?<\/blockquote>/gi);
  t = mask(t, /<[^>]+>/g); // remaining tags, attributes included
  t = mask(t, /https?:\/\/\S+/g);
  return t;
}

/**
 * TS/JS/TSX: keep string literals and JSX text that read like prose; blank code, imports,
 * class names, paths and other strings that look like code.
 */
export function extractSource(text: string): string {
  const ranges: Array<[number, number]> = [];
  const patterns = [/"((?:[^"\\\n]|\\.){12,})"/g, /'((?:[^'\\\n]|\\.){12,})'/g, /`((?:[^`\\]|\\.){12,})`/g, />([^<>{}]{12,})</g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const inner = m[1]!;
      const lineStart = text.lastIndexOf("\n", m.index!) + 1;
      if (/^\s*import\b/.test(text.slice(lineStart, m.index!))) continue;
      // class lists: className="...", class="...", cn("...", ...)
      if (/(?:className|class)\s*=\s*\{?\s*$|\bcn\([^)]*$|\bclsx\([^)]*$/.test(text.slice(Math.max(0, m.index! - 80), m.index!))) continue;
      if (!readsLikeProse(inner)) continue;
      const start = m.index! + 1;
      ranges.push([start, start + inner.length]);
    }
  }
  let t = keepOnly(text, ranges);
  t = mask(t, /`[^`\n]+`/g); // markdown-style inline code inside strings
  t = mask(t, /https?:\/\/\S+/g);
  return t;
}

/**
 * TS/JS/TSX, for character rules: every string literal and JSX text, however short, minus
 * imports and class lists. A two-character label like "Next —" still gets checked for dashes.
 */
export function extractSourceStrings(text: string): string {
  const ranges: Array<[number, number]> = [];
  const patterns = [/"((?:[^"\\\n]|\\.)+)"/g, /'((?:[^'\\\n]|\\.)+)'/g, /`((?:[^`\\]|\\.)+)`/g, />([^<>{}=]+)</g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const lineStart = text.lastIndexOf("\n", m.index!) + 1;
      if (/^\s*import\b/.test(text.slice(lineStart, m.index!))) continue;
      if (/(?:className|class)\s*=\s*\{?\s*$|\bcn\([^)]*$|\bclsx\([^)]*$/.test(text.slice(Math.max(0, m.index! - 80), m.index!))) continue;
      const start = m.index! + 1;
      ranges.push([start, start + m[1]!.length]);
    }
  }
  return keepOnly(text, ranges);
}

function readsLikeProse(s: string): boolean {
  const words = s.replace(/\s+/g, " ").trim().split(" ");
  if (words.length < 3) return false;
  const codey = words.filter((w) => /[\[\]/:=_{}<>]|^\d+(px|rem|%)$|^[a-z]+-[a-z0-9-]+$/.test(w) && !/^[\p{L}]+-[\p{L}]+[.,;:]?$/u.test(w)).length;
  return codey / words.length < 0.34;
}

/** Two views of a file: `prose` for phrase and structure rules, `chars` for dash, quote and ellipsis rules. */
export function extractViews(text: string, kind: Kind): { prose: string; chars: string } {
  const prose = extract(text, kind);
  return { prose, chars: kind === "source" ? extractSourceStrings(text) : prose };
}

export function extract(text: string, kind: Kind): string {
  switch (kind) {
    case "markdown":
      return extractMarkdown(text);
    case "html":
      return extractHtml(text);
    case "source":
      return extractSource(text);
    case "text":
      return text;
  }
}
