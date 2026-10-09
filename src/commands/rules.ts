import { defineCommand } from "../core/cli";
import { allRules, stockPhraseCount } from "../lib/rules";

export const rules = defineCommand({
  name: "rules",
  summary: "List every rule with its id, severity and fix",
  examples: ["prose-scrub rules --json"],
  run: () => ({
    rules: allRules,
    stockPhrases: stockPhraseCount(),
    sources: {
      deslop: "Mackenzie Bowes's deslop skill (ai-phrases.tsv and its pass rules)",
      "stop-slop": "github.com/hardikpandya/stop-slop references/phrases.md @ 8da1f03, MIT",
    },
  }),
  render: (r) =>
    r.rules
      .map((x) => `${x.severity === "error" ? "error  " : "warning"}  ${x.id.padEnd(30)}  ${x.description}\n         ${"".padEnd(30)}  fix: ${x.fix}`)
      .join("\n") + `\n\n${r.stockPhrases} stock phrases in phrase.stock. Errors fail the gate; warnings fail it with --strict.`,
});
