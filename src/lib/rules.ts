import phrasesTsv from "../data/ai-phrases.tsv" with { type: "text" };

export type Severity = "error" | "warning";

/** A rule that matches inside a line of prose. */
export type LineRule = {
  id: string;
  severity: Severity;
  description: string;
  fix: string;
  source: "deslop" | "stop-slop" | "scrub";
  pattern: RegExp;
};

const APOS = "['’]"; // straight or curly apostrophe

/** Escape a literal phrase for a regex, letting any apostrophe match either kind. */
function lit(phrase: string): string {
  return phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/['’]/g, APOS)
    .replace(/\s+/g, "\\s+");
}

/** Whole-word, case-insensitive alternation of phrases. */
function words(phrases: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.map(lit).join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

// deslop: phrases LLMs over-produce, with simple suffix variation on the first and last word
// ("underscores the importance", "playing a pivotal role").
function deslopPhrases(): string[] {
  return phrasesTsv
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("\t"))
    .filter((cols) => cols.length >= 3 && !(cols[3] ?? "").trim())
    .map((cols) => cols[2]!.trim())
    .filter(Boolean);
}

function loosePhrase(phrase: string): string {
  const parts = phrase.split(/\s+/).map(lit);
  if (parts.length === 1) return `${parts[0]}(?:s|es)?`;
  parts[0] = `${parts[0]}(?:s|es|ed|d|ing)?`;
  parts[parts.length - 1] = `${parts[parts.length - 1]}(?:s|es)?`;
  return parts.join("\\s+");
}

const stock = deslopPhrases();

export const lineRules: LineRule[] = [
  // ---- errors: the gate fails on these ----
  {
    id: "dash.em",
    severity: "error",
    description: "Em dash. Punctuation a keyboard doesn't produce; the loudest tell.",
    fix: "Use a comma, a colon, parentheses, or two sentences. A spaced hyphen ( - ) if nothing else fits.",
    source: "deslop",
    pattern: /—|&mdash;|&#8212;|&#x2014;/g,
  },
  {
    id: "dash.en",
    severity: "error",
    description: "En dash.",
    fix: "Use a plain hyphen for ranges (2020-2024), otherwise rewrite as for an em dash.",
    source: "deslop",
    pattern: /–|&ndash;|&#8211;|&#x2013;/g,
  },
  {
    id: "dash.bar",
    severity: "error",
    description: "Horizontal bar used as a dash.",
    fix: "Rewrite as for an em dash.",
    source: "deslop",
    pattern: /―|&#8213;|&#x2015;/g,
  },
  {
    id: "dash.double-hyphen",
    severity: "error",
    description: "Double hyphen standing in for an em dash.",
    fix: "Rewrite as for an em dash.",
    source: "deslop",
    // " -- " between words, or word--word. Not "--flag", which has a space before and none after.
    pattern: /(?<=\S) -- (?=\S)|(?<=[\p{L}\p{N}])--(?=[\p{L}\p{N}])/gu,
  },
  {
    id: "quote.curly",
    severity: "error",
    description: "Curly quotes. Hand-typed text has straight quotes.",
    fix: 'Use straight quotes: " and \'.',
    source: "deslop",
    pattern: /[“”‘’]|&[lr][ds]quo;|&#82(?:16|17|20|21);/g,
  },
  {
    id: "ellipsis.char",
    severity: "error",
    description: "Single-character ellipsis.",
    fix: "Use three periods (...).",
    source: "deslop",
    pattern: /…|&hellip;|&#8230;/g,
  },
  {
    id: "phrase.stock",
    severity: "error",
    description: "Stock phrase that LLMs produce far more often than people do.",
    fix: "Say the specific thing plainly, or cut the sentence if there isn't one.",
    source: "deslop",
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${stock.map(loosePhrase).join("|")})(?![\\p{L}\\p{N}])`, "giu"),
  },
  {
    id: "phrase.throat-clearing",
    severity: "error",
    description: "Throat-clearing opener that announces a point instead of making it.",
    fix: "Delete it and start with the point.",
    source: "stop-slop",
    pattern: words([
      "here's the thing",
      "here's what",
      "here's why",
      "here's how",
      "the uncomfortable truth is",
      "the truth is",
      "it turns out",
      "let me be clear",
      "i'll say it again",
      "i'm going to be honest",
      "can we talk about",
      "here's the problem though",
    ]),
  },
  {
    id: "phrase.emphasis-crutch",
    severity: "error",
    description: "Emphasis crutch that adds no meaning.",
    fix: "Delete it.",
    source: "stop-slop",
    pattern: new RegExp(
      `${words(["let that sink in", "make no mistake", "here's why that matters", "this matters because"]).source}|(?:^|[.!?]\\s+)(?:Full stop|Period)\\.`,
      "giu",
    ),
  },
  {
    id: "phrase.filler",
    severity: "error",
    description: "Filler opener or closer.",
    fix: "Delete it and start at the real first sentence.",
    source: "stop-slop",
    pattern: words([
      "at its core",
      "in today's",
      "it's worth noting",
      "it is worth noting",
      "at the end of the day",
      "when it comes to",
      "in a world where",
      "the reality is",
      "in conclusion",
      "in summary",
      "to sum up",
    ]),
  },
  {
    id: "phrase.meta",
    severity: "error",
    description: "Meta-commentary about the writing instead of the subject.",
    fix: "Delete it. Let the structure show itself.",
    source: "stop-slop",
    pattern: new RegExp(
      `${words([
        "plot twist:",
        "you already know this, but",
        "but that's another post",
        "is a feature, not a bug",
        "the rest of this essay explains",
        "let me walk you through",
        "in this section, we'll",
        "as we'll see",
        "i want to explore",
      ]).source}`,
      "giu",
    ),
  },
  {
    id: "phrase.vague-declarative",
    severity: "error",
    description: "Announces importance without naming the specific thing.",
    fix: "Replace it with the specific thing, or cut it.",
    source: "stop-slop",
    pattern: words([
      "the reasons are structural",
      "the implications are significant",
      "this is the deepest problem",
      "the stakes are high",
      "the consequences are real",
    ]),
  },

  // ---- warnings: shown always, fail the gate only with --strict ----
  {
    id: "structure.pre-negation",
    severity: "warning",
    description: 'Pre-negation: "it\'s not X, it\'s Y". Knocks down a claim nobody made.',
    fix: "Delete the negated half and keep the claim. Keep the contrast only if a real reader could have believed X.",
    source: "deslop",
    pattern: new RegExp(
      [
        `\\b(?:it|this|that|they|we|he|she)(?:${APOS}s|${APOS}re| is| was| are| were)?\\s+(?:not|n${APOS}t|isn${APOS}t|wasn${APOS}t|aren${APOS}t)\\s+(?:just\\s+|only\\s+|merely\\s+|simply\\s+|about\\s+)?[^.;:!?]{1,60}?[,;]\\s*(?:it|this|that|they|we|he|she)(?:${APOS}s|${APOS}re| is| was| are| were)\\b`,
        `\\bnot\\s+only\\b[^.;!?]{1,80}?\\bbut\\b`,
        `\\bnot\\s+(?:just\\s+)?(?:a|an|the)\\s+[^.;:!?]{1,40}?,\\s+but\\b`,
        `(?:^|[.!?]\\s+)Less\\s+\\w+(?:\\s+\\w+)?,\\s+more\\s+\\w+`,
        `(?:^|[.!?]\\s+)No\\s+\\w+(?:\\s+\\w+)?,\\s+no\\s+\\w+(?:\\s+\\w+)?,\\s+just\\b`,
        `\\bisn${APOS}t\\s+(?:just\\s+)?about\\b[^.;!?]{1,60}?[.;]\\s+(?:it|this)${APOS}s\\s+about\\b`,
      ].join("|"),
      "giu",
    ),
  },
  {
    id: "structure.trailing-participle",
    severity: "warning",
    description: 'Trailing participle clause: "..., ensuring seamless integration".',
    fix: "If it adds a fact, make it its own sentence. Otherwise delete it.",
    source: "deslop",
    pattern: /,\s+(?:ensuring|highlighting|underscoring|showcasing|fostering|reflecting|emphasizing|emphasising|demonstrating|solidifying|cementing|paving the way)\b/giu,
  },
  {
    id: "structure.connector-opener",
    severity: "warning",
    description: "Paragraph opens with a connector.",
    fix: "Delete it, or rewrite so the logical turn shows in the content.",
    source: "deslop",
    pattern: /^\s*(?:[-*]\s+)?(?:Moreover|Furthermore|Additionally|In addition|Notably|Importantly|Ultimately|Overall|Crucially),/gmu,
  },
  {
    id: "word.corporate",
    severity: "warning",
    description: "Corporate or inflated word.",
    fix: "Use the plain word: use, help, lead, start, strong, smooth, look at.",
    source: "deslop",
    pattern: words([
      "utilize", "utilizes", "utilized", "utilizing", "utilization",
      "leverage", "leverages", "leveraged", "leveraging",
      "facilitate", "facilitates", "facilitated", "facilitating",
      "spearhead", "spearheads", "spearheaded", "spearheading",
      "empower", "empowers", "empowered", "empowering",
      "streamline", "streamlines", "streamlined", "streamlining",
      "seamless", "seamlessly", "robust", "holistic", "synergy", "synergies",
      "cutting-edge", "best-in-class", "world-class", "game-changing",
      "delve", "delves", "delving", "elevate", "elevates", "tapestry", "testament to",
    ]),
  },
  {
    id: "phrase.jargon",
    severity: "warning",
    description: "Business jargon.",
    fix: "Handle, explain, accept, field, important, commit, analysis, reconsider, next, revisit, agreed.",
    source: "stop-slop",
    pattern: words([
      "navigate the", "navigating the", "unpack", "unpacking", "lean into", "leaning into",
      "the landscape", "game-changer", "double down", "doubling down", "deep dive",
      "take a step back", "moving forward", "circle back", "on the same page",
    ]),
  },
  {
    id: "word.adverb",
    severity: "warning",
    description: "Softener or intensifier adverb.",
    fix: "Delete it. If the sentence goes flat, the claim needed support, not an adverb.",
    source: "stop-slop",
    pattern: words([
      "really", "literally", "genuinely", "honestly", "simply", "actually", "deeply", "truly",
      "fundamentally", "inherently", "inevitably", "interestingly", "importantly", "crucially",
    ]),
  },
];

/** File-level checks, computed over the whole text. */
export const fileRules = [
  {
    id: "rhythm.flat",
    severity: "warning" as Severity,
    description: "Sentence lengths barely vary (burstiness under 0.6). Uniform cadence reads as generated.",
    fix: "Split a long sentence, merge two short ones, put a four-word sentence next to a thirty-word one.",
    source: "deslop" as const,
  },
];

export const allRules = [...lineRules.map(({ pattern, ...r }) => r), ...fileRules];

export function stockPhraseCount(): number {
  return stock.length;
}
