import { appendFileSync } from "node:fs";
import { defineCommand, UsageError } from "../core/cli";
import { readOne } from "../lib/input";
import { DEFAULT_MODEL, judge as runJudge, PROMPT_VERSION, rankings, type RankingResult, type Usage } from "../lib/judge";
import { units } from "../lib/units";

type JudgeResult = { file: string; model: string; promptVersion: number; results: RankingResult[]; flagged: number; usage: Usage };

export const judge = defineCommand({
  name: "judge",
  summary: "Advisory: have a small model rank paragraphs and sentences for patterns rules can't see",
  description: `Runs each ranking several times in parallel on the units from \`prose-scrub units\` and averages the scores; each unit keeps its per-run scores and their spread. Rankings: ${rankings.map((r) => `${r.id} (${r.unit}s; flags ${r.flag.description})`).join(", ")}. Flag thresholds are provisional until calibrated. This is not the gate: exit 0 whatever it finds, with the count in \`flagged\`. Needs an Anthropic API key: ANTHROPIC_API_KEY, or on macOS the Keychain item named by PROSE_SCRUB_KEYCHAIN_SERVICE (default anthropic-api-key).`,
  args: "<file>",
  flags: {
    stdin: { type: "boolean", description: "Read the text from stdin instead of a file" },
    as: { type: "string", default: "md", description: "Format of stdin text: md, mdx, html, txt, ts, tsx or js" },
    rankings: { type: "string", default: rankings.map((r) => r.id).join(","), description: `Comma-separated rankings to run: ${rankings.map((r) => r.id).join(", ")}` },
    runs: { type: "string", default: "5", description: "Parallel runs per ranking, averaged (1 to 10)" },
    model: { type: "string", default: DEFAULT_MODEL, description: "Model id" },
    scale: { type: "string", default: "50", description: "Top of the scale the model scores on (e.g. 50). Scores are divided by it, so results and flags stay 0 to 1" },
    log: { type: "string", description: "Append every run's raw scores to this JSONL file, for calibration" },
  },
  examples: ["prose-scrub judge post.md --json", "prose-scrub judge post.md --rankings significance --runs 5 --log ~/prose-scrub-runs.jsonl --json"],
  run: async ({ flags, args, log }) => {
    const { file, src, kind } = await readOne(args, flags, "prose-scrub judge post.md --json");
    const runs = Number(flags.runs);
    if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new UsageError(`--runs must be a whole number from 1 to 10, not "${flags.runs}".`);
    const scale = Number(flags.scale);
    if (!Number.isFinite(scale) || scale <= 0 || scale > 1000) throw new UsageError(`--scale must be a number above 0 and at most 1000, not "${flags.scale}".`);
    const wanted = flags.rankings.split(",").map((s) => s.trim()).filter(Boolean);
    const unknown = wanted.filter((id) => !rankings.some((r) => r.id === id));
    if (unknown.length || !wanted.length) throw new UsageError(`Unknown ranking: ${unknown.join(", ") || "(none given)"}.`, `Use ${rankings.map((r) => r.id).join(", ")}.`);
    const paragraphs = units(src, kind);
    if (!paragraphs.length) throw new UsageError(`No paragraphs to judge in ${file}.`, "judge reads paragraphs; headings, lists and tables alone aren't enough.");
    const at = new Date().toISOString();
    const hash = new Bun.CryptoHasher("sha256").update(src).digest("hex").slice(0, 16);
    log(`judging ${paragraphs.length} paragraphs, ${runs} runs per ranking`);
    const { results, usage } = await runJudge(paragraphs, {
      rankings: rankings.filter((r) => wanted.includes(r.id)),
      runs,
      model: flags.model,
      scale,
      log: flags.log ? (row) => appendFileSync(flags.log!, `${JSON.stringify({ at, file, hash, model: flags.model, promptVersion: PROMPT_VERSION, ...(row as object) })}\n`) : undefined,
    });
    return { file, model: flags.model, promptVersion: PROMPT_VERSION, results, flagged: results.reduce((a, r) => a + r.flagged, 0), usage };
  },
  render: (r: JudgeResult) => {
    const lines = [r.file];
    for (const res of r.results) {
      lines.push("", `${res.ranking} (${res.runs.complete}/${res.runs.requested} runs complete; flags ${res.flag}): ${res.flagged} flagged`);
      for (const u of res.units.filter((u) => u.flagged)) {
        const scores = Object.entries(u.mean).map(([k, v]) => `${k} ${v} ±${u.spread[k]}`).join(", ");
        lines.push(`  ${String(u.line).padStart(4)}  ${u.id}  ${scores}`, `        ${u.text.length > 140 ? `${u.text.slice(0, 140)}...` : u.text}`);
      }
    }
    lines.push("", `${r.usage.calls} calls, ${r.usage.input_tokens} input and ${r.usage.output_tokens} output tokens`);
    return lines.join("\n");
  },
});
