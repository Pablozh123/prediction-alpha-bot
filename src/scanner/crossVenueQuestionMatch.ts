/**
 * Why two similar-looking titles are probably not the same question.
 *
 * Title similarity is blind to the words that carry the question. The
 * 2026-07-31 cross-venue study found its two largest apparent edges - 79 and
 * 64 cents - on pairs that shared every name and date and still asked
 * different things: the outright result against the margin of victory, and
 * winning a nomination against merely running for it. A third failure mode is
 * a question and its inversion ("above 120,000" against "below 120,000"),
 * which prices as an edge and is the same bet placed twice.
 *
 * This is a port of the question-type check the sibling research project
 * settled on (app/cross_pairs.py, 2026-07-31). It classifies, it does not
 * verify: an empty result means "nothing noticed", never "same question".
 * Rule comparison stays a human task and the pair stays `unverified`.
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
  ["level", /\b(above|over|higher than|more than|exceed|exceeds|at least|greater than)\b/u, /\b(below|under|lower than|less than|fewer than|at most)\b/u],
  ["time", /\b(before|by|prior to|earlier than)\b/u, /\b(after|later than|not before)\b/u],
  ["polarity", /\b(will|does|is|be)\b(?!\s+not\b)/u, /\b(will not|won't|does not|doesn't|is not|isn't|not be|fail to|fails to)\b/u],
];

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.$+\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
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

export function extractStrikes(text: string): Set<string> {
  const normalized = normalizeQuestionText(text);
  const strikes = new Set<string>();

  for (const match of normalized.matchAll(/\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(%|percent|k|m|bn|b)?/gu)) {
    const raw = match[1]?.replace(/,/gu, "");
    const unit = match[2] ?? "";

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

    strikes.add(`${value}${unit === "percent" ? "%" : unit}`);
  }

  return strikes;
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
