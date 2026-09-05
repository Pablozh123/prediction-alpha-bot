/**
 * Why two similar-looking titles are probably not the same question.
 *
 * Title similarity is blind to the words that carry the question. The
 * 2026-07-31 cross-venue study found its two largest apparent edges - 79 and
 * 64 cents - on pairs that shared every name and date and still asked
 * different things: the outright result against the margin of victory, and
 * winning a nomination against merely running for it. A third failure mode is
 * a question and its inversion ("above 120,000" against "below 120,000"),
 * which prices as an edge and is the same bet placed twice. After the Kalshi
 * universe fix of 2026-08-31 two more shapes got through: winning the election
 * against winning the nomination (the second presupposes the first and prices
 * November on top), and the same club in two different competitions.
 *
 * This is the automated screen, stage 1 of the pair protocol in
 * docs/ARB_TAXONOMY.md. The website's matcher (app/cross_pairs.py) implements
 * the same rules; config/pair_screen_cases.json is the shared specification
 * both must pass. It classifies, it does not verify: `passed` means "nothing
 * noticed", never "same question". Rule comparison stays a human task.
 */

import type { RejectionReason } from "../core/rejectionReasons.js";

export type QuestionIntent = "result" | "participation" | "margin" | "count";

export type QuestionMismatch = {
  reason: Extract<
    RejectionReason,
    "question_type_mismatch" | "question_inverted"
  >;
  detail: string;
};

/** The neutral verdict vocabulary of config/pair_screen_cases.json. */
export type PairScreenVerdict =
  | "passed"
  | "inverted"
  | "different_question"
  | "compound_market"
  | "resolution_time_mismatch";

export const DEFAULT_RESOLUTION_GAP_TOLERANCE_DAYS = 7;

const INTENT_PATTERNS: Array<[QuestionIntent, RegExp]> = [
  [
    "margin",
    /\b(margin|by more than|by at least|by fewer than|by less than|by \d+(\.\d+)?\s*(points?|pts|percent|%|pp)|spread|point differential)\b/u,
  ],
  [
    "participation",
    /\b(run for|runs for|running for|announce|announces|announced|candidacy|enter the race|enters the race|declare|declares|file to run|files to run|be a candidate|seek the nomination|seeks the nomination)\b/u,
  ],
  [
    "count",
    /\b(how many|number of|count of|at least \d+ (seats|states|votes|goals|points)|\d+\+ (seats|states|votes|goals|points))\b/u,
  ],
  [
    "result",
    /\b(win|wins|winner|won|nominee|nominated|elected|be the next|become|becomes|champion|take the|takes the|carry|carries)\b/u,
  ],
];

const DIRECTION_GROUPS: Array<[string, RegExp, RegExp]> = [
  [
    "level",
    /\b(above|over|higher than|more than|exceed|exceeds|at least|greater than|or more)\b/u,
    /\b(below|under|lower than|less than|fewer than|at most|or less|or fewer)\b/u,
  ],
  ["time", /\b(before|by|prior to|earlier than)\b/u, /\b(after|later than|not before)\b/u],
  ["polarity", /\b(will|does|is|be)\b(?!\s+not\b)/u, /\b(will not|won't|does not|doesn't|is not|isn't|not be|fail to|fails to)\b/u],
];

/**
 * A negation on exactly one side. Deliberately not the tokenizer: it drops
 * "no" as a stop word. The exception after `no` keeps "No. 1 seed".
 */
const NEGATION_PATTERN =
  /\b(?:not|never|without|neither|nor|unable|fails?\s+to)\b|\bno\b(?!\.?\s*\d)/u;

/**
 * The same person in two different contests. Winning the nomination and
 * winning the election are two questions: the second presupposes the first.
 * Intent patterns miss it because "win" and "nominee" are both results.
 */
const SCOPE_GROUPS: Array<[string, ReadonlySet<string>, ReadonlySet<string>]> = [
  [
    "election vs nomination",
    new Set(["election", "elections", "elected", "presidency"]),
    new Set(["nomination", "nominee", "nominated", "primary", "caucus", "caucuses"]),
  ],
];

/**
 * Named competitions. Two titles that each name one and share none ask about
 * two tournaments, whatever club and season they share. Only phrases: "league"
 * alone decides nothing. "club world cup" contains "world cup"; the longer
 * phrase wins.
 */
const COMPETITION_PHRASES = [
  "champions league",
  "europa league",
  "conference league",
  "premier league",
  "fa cup",
  "efl cup",
  "carabao cup",
  "community shield",
  "la liga",
  "copa del rey",
  "serie a",
  "coppa italia",
  "bundesliga",
  "dfb pokal",
  "ligue 1",
  "coupe de france",
  "taca de portugal",
  "eredivisie",
  "club world cup",
  "world cup",
  "mls cup",
  "super bowl",
  "stanley cup",
  "world series",
  "nba finals",
] as const;

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.$+\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function words(text: string): Set<string> {
  return new Set(normalizeQuestionText(text).split(" ").filter(Boolean));
}

export function questionIntents(text: string): Set<QuestionIntent> {
  const normalized = normalizeQuestionText(text);
  const intents = new Set<QuestionIntent>();

  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(normalized)) {
      intents.add(intent);
    }
  }

  // A result verb next to a margin or participation phrase does not make it a
  // result question; the more specific intent wins.
  if (intents.has("margin") || intents.has("participation") || intents.has("count")) {
    intents.delete("result");
  }

  return intents;
}

/** Words that make a bare number a threshold rather than a date. */
const STRIKE_CONTEXT_BEFORE =
  /\b(above|over|below|under|at least|at most|more than|less than|fewer than|greater than|by|exceeds?|exceeding|reach(?:es)?|hits?|of)\s*$/u;
const STRIKE_CONTEXT_AFTER = /^\s*(or more|or less|or fewer|points?|pts|seats?|votes?|goals?|times|cuts?)\b/u;

/**
 * The thresholds a title carries. A dollar sign or a unit makes a number a
 * strike on its own; a bare number only counts next to a direction word,
 * so "August 19, 2026" is a date and "by 5 points" is a margin.
 */
export function extractStrikes(text: string): Set<string> {
  const normalized = normalizeQuestionText(text);
  const strikes = new Set<string>();

  for (const match of normalized.matchAll(/(\$?)\s?(\d[\d,]*(?:\.\d+)?)\s*(%|percent|k|m|bn|b)?(?![a-z0-9])/gu)) {
    const currency = match[1] === "$";
    const raw = match[2]?.replace(/,/gu, "");
    const unit = match[3] ?? "";

    if (!raw) {
      continue;
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      continue;
    }

    // Years are not strikes.
    if (unit === "" && value >= 1900 && value <= 2100 && Number.isInteger(value)) {
      continue;
    }

    if (!currency && unit === "") {
      const before = normalized.slice(0, match.index ?? 0);
      const after = normalized.slice((match.index ?? 0) + match[0].length);

      if (!STRIKE_CONTEXT_BEFORE.test(before) && !STRIKE_CONTEXT_AFTER.test(after)) {
        continue;
      }
    }

    strikes.add(`${value}${unit === "percent" ? "%" : unit}`);
  }

  return strikes;
}

/** Which named competitions a title mentions; the longer phrase wins. */
export function competitions(text: string): Set<string> {
  const normalized = normalizeQuestionText(text);
  const found = new Set<string>();

  for (const phrase of COMPETITION_PHRASES) {
    if (normalized.includes(phrase)) {
      found.add(phrase);
    }
  }

  if (found.has("club world cup")) {
    found.delete("world cup");
  }

  return found;
}

/**
 * Compare two market titles and report the first reason they are not the same
 * question. `null` means nothing noticed.
 */
export function classifyQuestionMismatch(
  left: string,
  right: string,
): QuestionMismatch | null {
  const leftText = normalizeQuestionText(left);
  const rightText = normalizeQuestionText(right);

  for (const [name, positive, negative] of DIRECTION_GROUPS) {
    const leftPositive = positive.test(leftText);
    const leftNegative = negative.test(leftText);
    const rightPositive = positive.test(rightText);
    const rightNegative = negative.test(rightText);

    // A side that names both directions decides nothing.
    if ((leftPositive && leftNegative) || (rightPositive && rightNegative)) {
      continue;
    }

    if (
      (leftPositive && rightNegative) ||
      (leftNegative && rightPositive)
    ) {
      // Only an inversion when the questions otherwise line up on a number.
      const leftStrikes = extractStrikes(left);
      const rightStrikes = extractStrikes(right);
      const sharedStrike =
        leftStrikes.size === 0 && rightStrikes.size === 0
          ? name === "polarity"
          : [...leftStrikes].some((strike) => rightStrikes.has(strike));

      if (sharedStrike) {
        return {
          reason: "question_inverted",
          detail: `opposite direction (${name})`,
        };
      }
    }
  }

  if (NEGATION_PATTERN.test(leftText) !== NEGATION_PATTERN.test(rightText)) {
    return {
      reason: "question_inverted",
      detail: "negation on one side only",
    };
  }

  const leftIntents = questionIntents(left);
  const rightIntents = questionIntents(right);
  const symmetricDifference = [
    ...[...leftIntents].filter((intent) => !rightIntents.has(intent)),
    ...[...rightIntents].filter((intent) => !leftIntents.has(intent)),
  ];

  if (leftIntents.size > 0 && rightIntents.size > 0 && symmetricDifference.length > 0) {
    return {
      reason: "question_type_mismatch",
      detail: `different question types: ${[...leftIntents].sort().join(",") || "none"} against ${[...rightIntents].sort().join(",") || "none"}`,
    };
  }

  const leftWords = words(left);
  const rightWords = words(right);

  for (const [name, oneGroup, otherGroup] of SCOPE_GROUPS) {
    const leftOne = intersects(leftWords, oneGroup);
    const leftOther = intersects(leftWords, otherGroup);
    const rightOne = intersects(rightWords, oneGroup);
    const rightOther = intersects(rightWords, otherGroup);

    // A side that names both scopes ("nominee wins the election") decides nothing.
    if ((leftOne && leftOther) || (rightOne && rightOther)) {
      continue;
    }

    if ((leftOne && rightOther) || (leftOther && rightOne)) {
      return {
        reason: "question_type_mismatch",
        detail: `different scope (${name})`,
      };
    }
  }

  const leftCompetitions = competitions(left);
  const rightCompetitions = competitions(right);

  if (
    leftCompetitions.size > 0 &&
    rightCompetitions.size > 0 &&
    ![...leftCompetitions].some((phrase) => rightCompetitions.has(phrase))
  ) {
    return {
      reason: "question_type_mismatch",
      detail: `different competitions: ${[...leftCompetitions].sort().join(",")} against ${[...rightCompetitions].sort().join(",")}`,
    };
  }

  const leftStrikes = extractStrikes(left);
  const rightStrikes = extractStrikes(right);

  if (
    leftStrikes.size > 0 &&
    rightStrikes.size > 0 &&
    ![...leftStrikes].some((strike) => rightStrikes.has(strike))
  ) {
    return {
      reason: "question_type_mismatch",
      detail: `different thresholds: ${[...leftStrikes].sort().join(",")} against ${[...rightStrikes].sort().join(",")}`,
    };
  }

  return null;
}

/**
 * A Kalshi market that bundles several outcomes: a parlay or multigame
 * ticker, or a title of comma clauses ("Yes A, Yes B, Yes C"). One side of
 * such a pair is several questions, so the pair is none.
 */
export function isCompoundKalshiMarket(title: string, ticker?: string | null): boolean {
  if (/MULTIGAME|CROSSCATEGORY|PARLAY|COMBO/iu.test(ticker ?? "")) {
    return true;
  }

  // Commas inside numbers ("$120,000") and dates ("December 31, 2026") are
  // punctuation, not clause boundaries; without this step every threshold
  // market with a thousands separator counted as a parlay.
  const segments = title
    .replace(/(\d),(?=\d{3}\b)/gu, "$1")
    .replace(/\b([A-Za-z]{3,9}\.? \d{1,2}),\s*(\d{4})\b/gu, "$1 $2")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const yesNoClauses = segments.filter((segment) => /^(yes|no)\b/iu.test(segment)).length;

  return segments.length >= 3 || (segments.length >= 2 && yesNoClauses >= 2);
}

export function resolutionGapDays(
  left: number | string | null | undefined,
  right: number | string | null | undefined,
): number | null {
  const leftMs = toMs(left);
  const rightMs = toMs(right);

  if (leftMs === null || rightMs === null) {
    return null;
  }

  return Math.round((Math.abs(leftMs - rightMs) / 86_400_000) * 1000) / 1000;
}

/**
 * The whole automated screen for one pair, in the neutral vocabulary of
 * config/pair_screen_cases.json: compound market first, then direction and
 * question type, then the resolution dates. Missing dates decide nothing.
 */
export function screenTitlePair(input: {
  polymarketTitle: string;
  kalshiTitle: string;
  kalshiTicker?: string | null;
  polymarketEnd?: number | string | null;
  kalshiEnd?: number | string | null;
  toleranceDays?: number;
}): { verdict: PairScreenVerdict; reasons: string[] } {
  if (isCompoundKalshiMarket(input.kalshiTitle, input.kalshiTicker)) {
    return { verdict: "compound_market", reasons: ["Kalshi market bundles several outcomes"] };
  }

  const mismatch = classifyQuestionMismatch(input.polymarketTitle, input.kalshiTitle);

  if (mismatch) {
    return {
      verdict: mismatch.reason === "question_inverted" ? "inverted" : "different_question",
      reasons: [mismatch.detail],
    };
  }

  const gap = resolutionGapDays(input.polymarketEnd, input.kalshiEnd);
  const tolerance = input.toleranceDays ?? DEFAULT_RESOLUTION_GAP_TOLERANCE_DAYS;

  if (gap !== null && gap > tolerance) {
    return {
      verdict: "resolution_time_mismatch",
      reasons: [`resolution dates ${Math.round(gap)} days apart`],
    };
  }

  return { verdict: "passed", reasons: [] };
}

function intersects(wordsOfTitle: Set<string>, group: ReadonlySet<string>): boolean {
  for (const word of group) {
    if (wordsOfTitle.has(word)) {
      return true;
    }
  }

  return false;
}

function toMs(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
