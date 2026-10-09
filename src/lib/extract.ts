// Parse a file and return its readable text as blocks: one per paragraph, heading, label,
// attribute or string. Each block keeps the source offset of every character, so a finding
// points at the exact line and column in the original file. Code, markup, URLs, quotations
// and class names never become blocks.

import { decodeHTML } from "entities";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { mdxjs } from "micromark-extension-mdxjs";
import { parse as parseHtmlDocument, parseFragment as parseHtmlFragment } from "parse5";
import ts from "typescript";

export type Kind = "markdown" | "mdx" | "html" | "ts" | "tsx" | "text";

export function kindOf(path: string): Kind | null {
  const name = path.toLowerCase().split(/[\\/]/).pop() ?? "";
  if (/\.(md|markdown)\.txt$/.test(name)) return "markdown"; // templates like AGENTS.md.txt
  const ext = name.split(".").pop() ?? "";
  if (["md", "markdown"].includes(ext)) return "markdown";
  if (ext === "mdx") return "mdx";
  if (["html", "htm"].includes(ext)) return "html";
  if (["ts", "mts", "cts"].includes(ext)) return "ts";
  if (["tsx", "jsx", "js", "mjs", "cjs"].includes(ext)) return "tsx";
  if (["txt", "text"].includes(ext)) return "text";
  return null;
}

/** A source range and how its characters are written: HTML entities, JS escapes, or as-is. */
type Piece = { start: number; end: number; decode: "html" | "js" | "none" };

/** A stretch of readable text. */
export type Block = {
  pieces: Piece[];
  /** Phrase and structure rules apply. Character rules (dashes, quotes) apply to every block. */
  prose: boolean;
  /** A paragraph of sentences that counts toward rhythm. Headings, labels, list items and table cells don't. */
  rhythm: boolean;
};

/** A block's text with the source offset of every character. */
export type View = { text: string; at: number[] };

/**
 * `chars` keeps HTML entities as written (so `&mdash;` is reported as written); `prose` decodes
 * them. JS escapes are decoded in both, so "—" counts as a dash. URLs and backtick code are
 * blanked from the prose view.
 */
export function view(src: string, block: Block, mode: "chars" | "prose"): View {
  let text = "";
  const at: number[] = [];
  let prevEnd = -1;
  for (const p of block.pieces) {
    if (prevEnd >= 0 && p.start > prevEnd) {
      text += " "; // markup or code between pieces separates words
      at.push(prevEnd);
    }
    const raw = src.slice(p.start, p.end);
    const decoded = p.decode === "js" ? decodeJs(raw) : p.decode === "html" && mode === "prose" ? decodeEntities(raw) : identity(raw);
    text += decoded.text;
    for (const i of decoded.at) at.push(p.start + i);
    prevEnd = p.end;
  }
  text = text.replace(/[\r\n\t]/g, " ");
  if (mode === "prose") {
    text = text.replace(/https?:\/\/\S+|`[^`]+`/g, (m) => " ".repeat(m.length));
  }
  return { text, at };
}

function identity(raw: string): { text: string; at: number[] } {
  return { text: raw, at: Array.from({ length: raw.length }, (_, i) => i) };
}

function decodeEntities(raw: string): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  let last = 0;
  for (const m of raw.matchAll(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi)) {
    for (let i = last; i < m.index!; i++) (text += raw[i], at.push(i));
    const dec = decodeHTML(m[0]);
    for (const ch of dec) for (let k = 0; k < ch.length; k++) (text += ch[k], at.push(m.index!));
    last = m.index! + m[0].length;
  }
  for (let i = last; i < raw.length; i++) (text += raw[i], at.push(i));
  return { text, at };
}

function decodeJs(raw: string): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" };
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\" || i + 1 >= raw.length) {
      text += raw[i];
      at.push(i);
      continue;
    }
    const start = i;
    const c = raw[i + 1]!;
    let out: string;
    let m: RegExpExecArray | null;
    if ((m = /^u\{([\da-f]+)\}/i.exec(raw.slice(i + 1)))) out = String.fromCodePoint(parseInt(m[1]!, 16));
    else if ((m = /^u([\da-f]{4})/i.exec(raw.slice(i + 1)))) out = String.fromCharCode(parseInt(m[1]!, 16));
    else if ((m = /^x([\da-f]{2})/i.exec(raw.slice(i + 1)))) out = String.fromCharCode(parseInt(m[1]!, 16));
    else ((m = null), (out = c === "\n" ? "" : (simple[c] ?? c))); // a backslash before a newline continues the line
    i += m ? m[0].length : 1;
    for (let k = 0; k < out.length; k++) (text += out[k], at.push(start));
  }
  return { text, at };
}

export function readsLikeProse(s: string): boolean {
  const words = s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length < 3) return false;
  const codey = words.filter(
    (w) => (/[\[\]/:=_{}<>$]|^--?[a-z]|^\d+(px|rem|%)$|^[a-z]+-[a-z0-9-]+$/.test(w) && !/^[\p{L}]+-[\p{L}]+[.,;:]?$/u.test(w)) || /^[a-z]+\.[a-z]+/.test(w),
  ).length;
  return codey / words.length < 0.34;
}

/** True when the text ends at least one sentence. Headings, labels and buttons usually don't. */
function endsSentence(s: string): boolean {
  return /[.!?]['"”’)\]]*(?:\s|$)/.test(s.trim());
}

function plain(src: string, pieces: Piece[]): string {
  return pieces.map((p) => src.slice(p.start, p.end)).join(" ");
}

// ---------------------------------------------------------------------------------------------
// Markdown and MDX (mdast, with GFM tables, autolinks and footnotes, and front matter)

type MdNode = {
  type: string;
  children?: MdNode[];
  value?: string;
  url?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

const MD_SKIP = new Set(["code", "inlineCode", "blockquote", "definition", "toml", "math", "inlineMath", "mdxjsEsm", "mdxFlowExpression", "mdxTextExpression", "footnoteReference", "break"]);
const FRONT_MATTER_PROSE = /^(title|description|summary|excerpt|subtitle|tagline)\s*:\s*(["']?)(.+?)\2\s*$/;

function markdownBlocks(src: string, mdx: boolean): Block[] {
  const tree = fromMarkdown(src, {
    extensions: [gfm(), frontmatter(["yaml", "toml"]), ...(mdx ? [mdxjs()] : [])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(["yaml", "toml"]), ...(mdx ? [mdxFromMarkdown()] : [])],
  }) as unknown as MdNode;
  const blocks: Block[] = [];
  const start = (n: MdNode) => n.position!.start.offset!;
  const end = (n: MdNode) => n.position!.end.offset!;

  const inline = (node: MdNode, pieces: Piece[]) => {
    for (const child of node.children ?? []) {
      if (MD_SKIP.has(child.type) || child.type === "html") continue;
      if (child.type === "text") {
        pieces.push({ start: start(child), end: end(child), decode: "html" });
      } else if (child.type === "link") {
        const raw = src.slice(start(child), end(child));
        if (!raw.startsWith("[")) continue; // <https://...> or a bare URL: not prose
        inline(child, pieces);
      } else if (child.type === "image" || child.type === "imageReference") {
        const m = /^!\[((?:\\.|[^\]\\])*)\]/.exec(src.slice(start(child), end(child)));
        if (m?.[1]?.trim()) blocks.push({ pieces: [{ start: start(child) + 2, end: start(child) + 2 + m[1].length, decode: "html" }], prose: true, rhythm: false });
      } else {
        inline(child, pieces);
      }
    }
  };

  const visit = (node: MdNode, inList: boolean) => {
    if (MD_SKIP.has(node.type)) return;
    if (node.type === "yaml") {
      let offset = start(node) + src.slice(start(node)).indexOf("\n") + 1;
      for (const line of node.value!.split("\n")) {
        const m = FRONT_MATTER_PROSE.exec(line);
        if (m) {
          const at = offset + line.indexOf(m[3]!, m[1]!.length);
          blocks.push({ pieces: [{ start: at, end: at + m[3]!.length, decode: "none" }], prose: true, rhythm: false });
        }
        offset += line.length + 1;
      }
      return;
    }
    if (node.type === "html") {
      blocks.push(...htmlBlocks(node.value!, false).map((b) => shift(b, start(node))));
      return;
    }
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
      const pieces: Piece[] = [];
      inline(node, pieces);
      if (pieces.length) {
        const prose = node.type !== "tableCell" || readsLikeProse(plain(src, pieces));
        blocks.push({ pieces, prose, rhythm: node.type === "paragraph" && !inList });
      }
      return;
    }
    for (const child of node.children ?? []) visit(child, inList || node.type === "listItem");
  };
  visit(tree, false);
  return blocks;
}

function shift(block: Block, by: number): Block {
  return { ...block, pieces: block.pieces.map((p) => ({ ...p, start: p.start + by, end: p.end + by })) };
}

// ---------------------------------------------------------------------------------------------
// HTML (parse5)

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  sourceCodeLocation?: { startOffset: number; endOffset: number; attrs?: Record<string, { startOffset: number; endOffset: number }> } | null;
};

/** Elements whose content is code, markup or someone else's words. */
const SKIP_TAGS = new Set(["script", "style", "pre", "code", "kbd", "samp", "svg", "math", "template", "blockquote", "noscript", "textarea"]);
/** Elements that sit inside a block of text rather than starting one. */
const INLINE_TAGS = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "data", "dfn", "em", "i", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "br", "del", "ins", "Link"]);
/** Blocks that hold headings, labels or list items rather than paragraphs. */
const NO_RHYTHM_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "li", "th", "td", "dt", "button", "label", "option", "title", "summary", "legend", "caption", "nav", "select"]);
const PROSE_ATTRS = new Set(["alt", "title", "aria-label", "aria-description", "placeholder"]);
const META_PROSE = /^(description|og:description|og:title|twitter:description|twitter:title)$/;

function htmlBlocks(src: string, document: boolean): Block[] {
  const root = (document ? parseHtmlDocument : parseHtmlFragment)(src, { sourceCodeLocationInfo: true }) as unknown as HtmlNode;
  const blocks: Block[] = [];
  const groups: Array<{ tag: string; pieces: Piece[] }> = [];

  const attrValue = (node: HtmlNode, name: string): Piece | null => {
    const loc = node.sourceCodeLocation?.attrs?.[name];
    if (!loc) return null;
    const raw = src.slice(loc.startOffset, loc.endOffset);
    const m = /=\s*(["']?)/.exec(raw);
    if (!m) return null;
    const start = loc.startOffset + m.index + m[0].length;
    const end = loc.endOffset - (m[1] ? 1 : 0);
    return end > start ? { start, end, decode: "html" } : null;
  };

  const walk = (node: HtmlNode, group: { tag: string; pieces: Piece[] }) => {
    if (node.nodeName === "#text") {
      const loc = node.sourceCodeLocation;
      if (loc && src.slice(loc.startOffset, loc.endOffset).trim()) group.pieces.push({ start: loc.startOffset, end: loc.endOffset, decode: "html" });
      return;
    }
    if (node.nodeName === "#comment") return;
    const tag = node.tagName ?? "";
    if (SKIP_TAGS.has(tag)) return;
    for (const a of node.attrs ?? []) {
      const isMeta = tag === "meta" && a.name === "content" && (node.attrs ?? []).some((x) => (x.name === "name" || x.name === "property") && META_PROSE.test(x.value));
      if (!PROSE_ATTRS.has(a.name) && !isMeta) continue;
      const piece = attrValue(node, a.name);
      if (piece) blocks.push({ pieces: [piece], prose: true, rhythm: false });
    }
    let inner = group;
    if (tag && !INLINE_TAGS.has(tag)) {
      inner = { tag, pieces: [] };
      groups.push(inner);
    }
    for (const child of node.childNodes ?? []) walk(child, inner);
  };
  const top = { tag: "", pieces: [] as Piece[] };
  groups.push(top);
  walk(root, top);

  for (const g of groups) {
    if (!g.pieces.length) continue;
    blocks.push({ pieces: g.pieces, prose: true, rhythm: !NO_RHYTHM_TAGS.has(g.tag) && endsSentence(plain(src, g.pieces)) });
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// TypeScript, JavaScript, TSX and JSX (the TypeScript compiler's parser)

/** JSX attributes that hold identifiers, URLs, sizes or other non-prose. Strings in them still get character rules. */
const NON_PROSE_ATTRS =
  /^(href|src|srcSet|id|key|type|name|rel|target|role|as|variant|size|sizes|width|height|viewBox|d|fill|stroke|transform|xmlns|lang|dir|method|action|htmlFor|for|ref|data-.*|on[A-Z].*|tabIndex|autoComplete|inputMode|pattern|accept|encType|loading|decoding|media|integrity|crossOrigin|referrerPolicy|sandbox|allow|value|defaultValue|step|min|max|cx|cy|r|x|y|x1|x2|y1|y2|points|strokeWidth|fillRule|clipRule|strokeLinecap|strokeLinejoin|preserveAspectRatio|commands|command|code|language|lang|icon|path|slug|href.*)$/;
/** Attributes and calls whose strings are class lists or styles: skipped entirely. */
const CLASS_ATTRS = new Set(["className", "class", "style"]);
const CLASS_FNS = new Set(["cn", "clsx", "classNames", "cx", "twMerge", "twJoin", "cva", "tw"]);
const PROSE_JSX_TAGS = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "dd", "dt", "figcaption", "td", "th", "caption", "summary", "label", "title"]);

function sourceBlocks(src: string, jsx: boolean): Block[] {
  const sf = ts.createSourceFile(jsx ? "x.tsx" : "x.ts", src, ts.ScriptTarget.Latest, true, jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const blocks: Block[] = [];

  const stringPiece = (node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): Piece => ({ start: node.getStart(sf) + 1, end: node.end - 1, decode: "js" });

  const addString = (pieces: Piece[], proseAllowed: boolean) => {
    if (!pieces.some((p) => p.end > p.start)) return;
    const text = view(src, { pieces, prose: true, rhythm: false }, "prose").text;
    const prose = proseAllowed && readsLikeProse(text);
    blocks.push({ pieces, prose, rhythm: prose && endsSentence(text) });
  };

  const tagName = (el: ts.JsxElement | ts.JsxSelfClosingElement) =>
    (ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName).getText(sf);

  const jsxChildren = (children: ts.NodeArray<ts.JsxChild>, pieces: Piece[], proseAllowed: boolean) => {
    for (const child of children) {
      if (ts.isJsxText(child)) {
        if (child.getText(sf).trim()) pieces.push({ start: child.pos, end: child.end, decode: "html" });
      } else if (ts.isJsxExpression(child)) {
        const e = child.expression;
        if (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) pieces.push(stringPiece(e));
        else if (e) visit(e, proseAllowed);
      } else if (ts.isJsxElement(child)) {
        const tag = tagName(child);
        if (SKIP_TAGS.has(tag)) continue;
        if (INLINE_TAGS.has(tag)) {
          visit(child.openingElement.attributes, proseAllowed);
          jsxChildren(child.children, pieces, proseAllowed);
        } else {
          jsxBlock(child, proseAllowed);
        }
      } else if (ts.isJsxFragment(child)) {
        jsxChildren(child.children, pieces, proseAllowed);
      } else {
        visit(child, proseAllowed);
      }
    }
  };

  const jsxBlock = (el: ts.JsxElement | ts.JsxFragment, proseAllowed: boolean) => {
    const tag = ts.isJsxElement(el) ? tagName(el) : "";
    if (SKIP_TAGS.has(tag)) return;
    if (ts.isJsxElement(el)) visit(el.openingElement.attributes, proseAllowed);
    const pieces: Piece[] = [];
    jsxChildren(el.children, pieces, proseAllowed);
    if (!pieces.length) return;
    const text = view(src, { pieces, prose: true, rhythm: false }, "prose").text;
    const prose = proseAllowed && (PROSE_JSX_TAGS.has(tag) || readsLikeProse(text));
    blocks.push({ pieces, prose, rhythm: prose && !NO_RHYTHM_TAGS.has(tag) && endsSentence(text) });
  };

  const visit = (node: ts.Node, proseAllowed: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return;
    if (ts.isTypeNode(node) || ts.isTaggedTemplateExpression(node)) return;
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) return; // "use client"
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (callee === "require" || node.expression.kind === ts.SyntaxKind.ImportKeyword || CLASS_FNS.has(callee)) return;
    }
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (CLASS_ATTRS.has(name) || !node.initializer) return;
      visit(node.initializer, proseAllowed && !NON_PROSE_ATTRS.test(name));
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/^["'`]|["'`]$/g, "");
      if (CLASS_ATTRS.has(name)) return;
      if (ts.isComputedPropertyName(node.name)) visit(node.name, proseAllowed);
      visit(node.initializer, proseAllowed);
      return;
    }
    if (ts.isElementAccessExpression(node)) {
      visit(node.expression, proseAllowed);
      return;
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      jsxBlock(node, proseAllowed);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addString([stringPiece(node)], proseAllowed);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const pieces: Piece[] = [{ start: node.head.getStart(sf) + 1, end: node.head.end - 2, decode: "js" }];
      for (const span of node.templateSpans) {
        visit(span.expression, proseAllowed);
        const lit = span.literal;
        const tail = ts.isTemplateTail(lit) ? 1 : 2; // "`" or "${"
        pieces.push({ start: lit.getStart(sf) + 1, end: lit.end - tail, decode: "js" });
      }
      addString(pieces.filter((p) => p.end > p.start), proseAllowed);
      return;
    }
    ts.forEachChild(node, (c) => visit(c, proseAllowed));
  };
  visit(sf, true);
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Plain text: paragraphs are separated by blank lines.

function textBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const re = /\S[\s\S]*?(?=\n[ \t]*\n|\s*$)/g;
  for (const m of src.matchAll(re)) {
    blocks.push({ pieces: [{ start: m.index!, end: m.index! + m[0].length, decode: "none" }], prose: true, rhythm: true });
  }
  return blocks;
}

export function extract(src: string, kind: Kind): Block[] {
  const blocks = (() => {
    switch (kind) {
      case "markdown":
        return markdownBlocks(src, false);
      case "mdx":
        return markdownBlocks(src, true);
      case "html":
        return htmlBlocks(src, true);
      case "ts":
        return sourceBlocks(src, false);
      case "tsx":
        return sourceBlocks(src, true);
      case "text":
        return textBlocks(src);
    }
  })();
  return blocks.sort((a, b) => a.pieces[0]!.start - b.pieces[0]!.start);
}
