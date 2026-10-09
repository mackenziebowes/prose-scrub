// The headings of a Markdown or MDX file, in order, as plain text. Headings inside code blocks
// and front matter aren't headings, so the parser (not a regex) decides.

import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { mdxjs } from "micromark-extension-mdxjs";

export type Heading = { depth: number; text: string; line: number };

type Node = { type: string; depth?: number; value?: string; children?: Node[]; position?: { start: { line: number } } };

const text = (node: Node): string =>
  node.type === "text" || node.type === "inlineCode" ? node.value ?? "" : (node.children ?? []).map(text).join("");

export function headings(src: string, mdx: boolean): Heading[] {
  const tree = fromMarkdown(src, {
    extensions: [gfm(), frontmatter(["yaml", "toml"]), ...(mdx ? [mdxjs()] : [])],
    mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown(["yaml", "toml"]), ...(mdx ? [mdxFromMarkdown()] : [])],
  }) as unknown as Node;
  const out: Heading[] = [];
  const visit = (node: Node) => {
    if (node.type === "heading") out.push({ depth: node.depth!, text: text(node).replace(/\s+/g, " ").trim(), line: node.position!.start.line });
    else for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return out;
}
