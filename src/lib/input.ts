import { UsageError } from "../core/cli";
import { kindOf, type Kind } from "./extract";
import { displayPath, readFile } from "./scan";

export const KINDS: Record<string, Kind> = { md: "markdown", markdown: "markdown", mdx: "mdx", html: "html", tsx: "tsx", jsx: "tsx", js: "tsx", ts: "ts", txt: "text", text: "text" };

/** One file, or stdin with --as: the input for commands that read a single document. */
export async function readOne(args: string[], flags: { stdin?: boolean; as: string }, example: string): Promise<{ file: string; src: string; kind: Kind }> {
  if (flags.stdin) {
    const kind = KINDS[flags.as];
    if (!kind) throw new UsageError(`Unknown --as "${flags.as}".`, "Use md, mdx, html, txt, ts, tsx or js.");
    if (args.length) throw new UsageError("Pass a file or --stdin, not both.");
    return { file: "<stdin>", src: await new Response(Bun.stdin.stream()).text(), kind };
  }
  if (args.length !== 1) throw new UsageError("Pass exactly one file.", `Example: ${example}`);
  const kind = kindOf(args[0]!);
  if (!kind) throw new UsageError(`Can't read ${args[0]}.`, "Supported: .md .mdx .html .htm .txt .ts .tsx .js .jsx, and .md.txt templates.");
  if (!(await Bun.file(args[0]!).exists())) throw new UsageError(`Not found: ${args[0]}.`);
  return { file: displayPath(args[0]!), src: readFile(args[0]!), kind };
}
