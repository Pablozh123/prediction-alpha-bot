import type { CleanBasketFilterReason } from "./cleanBasketFilter.js";
import type { NegRiskBracketOpportunity } from "./negRiskBracketScanner.js";
import {
  DEFAULT_MAX_SHORT_DURATION_HOURS,
  classifyCapitalLock,
} from "../utils/marketTime.js";

export type NegRiskBasketClass =
  | "clean_arb"
  | "duration_risk"
  | "directional_bucket"
  | "invalid_or_ambiguous";

export type NegRiskPayoffStructure =
  | "clean"
  | "nested_temporal_basket"
  | "multi_winner_or_qualifier_basket"
  | "unknown_payoff_structure";

export type NegRiskBasketTextLeg = {
  question?: string | null;
  slug?: string | null;
};

export type NegRiskBasketClassification = {
  basketClass: NegRiskBasketClass;
  explanation: string;
  payoffStructure: NegRiskPayoffStructure;
  reason: string;
};

export function classifyNegRiskPayoffStructure(input: {
  eventSlug?: string | null;
  legs: NegRiskBasketTextLeg[];
}): NegRiskPayoffStructure {
  const eventSlug = normalizeText(input.eventSlug ?? "");
  const legTexts = input.legs.map((leg) =>
    normalizeText([leg.slug ?? "", leg.question ?? ""].join(" ")),
  );
  const combined = [eventSlug, ...legTexts].join(" ");

  if (hasMultiWinnerLanguage(combined)) {
    return "multi_winner_or_qualifier_basket";
  }

  if (isCleanBucketMarket(eventSlug, legTexts)) {
    return "clean";
  }

  if (hasNestedTemporalLanguage(combined)) {
    return "nested_temporal_basket";
  }

  if (isCleanOneWinnerMarket(eventSlug, combined)) {
    return "clean";
  }

  return "unknown_payoff_structure";
}

export function classifyNegRiskOpportunityRecord(input: {
  eventSlug?: string | null;
  expectedResolutionAt?: number | null;
  legs: NegRiskBasketTextLeg[];
  nowMs?: number;
  reason?: string | null;
}): NegRiskBasketClassification {
  const payoffStructure = classifyNegRiskPayoffStructure(input);

  if (
    payoffStructure === "nested_temporal_basket" ||
    payoffStructure === "multi_winner_or_qualifier_basket"
  ) {
    return {
      basketClass: "directional_bucket",
      explanation:
        payoffStructure === "nested_temporal_basket"
          ? "Nested date/window wording means the legs are not mutually exclusive clean outcomes."
          : "Qualifier or multi-winner wording means more than one leg can be true.",
      payoffStructure,
      reason: payoffStructure,
    };
  }

  if (payoffStructure !== "clean") {
    return {
      basketClass: "invalid_or_ambiguous",
      explanation:
        "The basket text does not prove a one-winner or clear bucket payoff.",
      payoffStructure,
      reason: payoffStructure,
    };
  }

  const capitalLock = classifyCapitalLock(
    input.expectedResolutionAt,
    input.nowMs,
  );

  if (capitalLock.capitalLockClass === "unknown") {
    return {
      basketClass: "duration_risk",
      explanation:
        "The basket payoff looks clean, but expected resolution time is missing.",
      payoffStructure,
      reason: "unknown_duration_for_short_arb",
    };
  }

  if (
    capitalLock.capitalLockClass !== "short" ||
    (capitalLock.durationHours ?? Number.POSITIVE_INFINITY) >
      DEFAULT_MAX_SHORT_DURATION_HOURS
  ) {
    return {
      basketClass: "duration_risk",
      explanation:
        "The basket payoff looks clean, but capital would be locked too long for the short-arb layer.",
      payoffStructure,
      reason: "duration_too_long_for_short_arb",
    };
  }

  if (input.reason && input.reason !== "paper_trade_recorded") {
    return classifyNegRiskFilterReason(input.reason);
  }

  return {
    basketClass: "clean_arb",
    explanation:
      "One-winner or clear bucket structure with short-duration timing.",
    payoffStructure,
    reason: "clean_basket_validated",
  };
}

export function classifyNegRiskFilterReason(
  reason: CleanBasketFilterReason | string,
): NegRiskBasketClassification {
  if (reason === "clean_basket_validated") {
    return {
      basketClass: "clean_arb",
      explanation:
        "One-winner or clear bucket structure passed edge, depth, spread, and duration gates.",
      payoffStructure: "clean",
      reason,
    };
  }

  if (
    reason === "unknown_duration_for_short_arb" ||
    reason === "duration_too_long_for_short_arb"
  ) {
    return {
      basketClass: "duration_risk",
      explanation:
        reason === "unknown_duration_for_short_arb"
          ? "Expected resolution time is missing, so the short-arb gate cannot prove capital lock."
          : "Expected resolution is too far away for the short-arb gate.",
      payoffStructure: "clean",
      reason,
    };
  }

  if (
    reason === "nested_temporal_basket" ||
    reason === "multi_winner_or_qualifier_basket"
  ) {
    return {
      basketClass: "directional_bucket",
      explanation:
        reason === "nested_temporal_basket"
          ? "Date/window legs can overlap, so this is not a pure mutually exclusive basket."
          : "Qualifier or multi-winner legs can have multiple winners.",
      payoffStructure: reason,
      reason,
    };
  }

  return {
    basketClass: "invalid_or_ambiguous",
    explanation:
      "The basket failed a structural, capacity, edge, spread, or explicit safety gate.",
    payoffStructure: "unknown_payoff_structure",
    reason,
  };
}

export function classifyNegRiskOpportunityForPaperFire(
  opportunity: NegRiskBracketOpportunity,
  filterReason: CleanBasketFilterReason | string,
): NegRiskBasketClassification {
  const reasonClassification = classifyNegRiskFilterReason(filterReason);

  if (reasonClassification.basketClass !== "clean_arb") {
    return reasonClassification;
  }

  return classifyNegRiskOpportunityRecord({
    eventSlug: opportunity.eventSlug,
    expectedResolutionAt: opportunity.expectedResolutionAt,
    legs: opportunity.legs,
    reason: "paper_trade_recorded",
  });
}

function hasMultiWinnerLanguage(text: string): boolean {
  return /\b(advance|advances|qualify|qualifies|runoff|top[-\s]?\d+|semifinal|finalists?)\b/u.test(
    text,
  );
}

function hasNestedTemporalLanguage(text: string): boolean {
  return /\b(before|by|until|through|no later than)\b/u.test(text);
}

function isCleanOneWinnerMarket(eventSlug: string, combined: string): boolean {
  return (
    /\b(champion|winner|wins?|win-the|election-winner|nominee)\b/u.test(
      eventSlug,
    ) ||
    /\bwin the\b/u.test(combined)
  );
}

function isCleanBucketMarket(eventSlug: string, legTexts: string[]): boolean {
  if (/\b(prison-time|sentencing|sentence|closing-market-cap)\b/u.test(eventSlug)) {
    return true;
  }

  const bucketLegs = legTexts.filter((text) =>
    /\b(no|less than|under|between|more than|over|above|below|at least)\b/u.test(
      text,
    ),
  );

  return legTexts.length >= 3 && bucketLegs.length === legTexts.length;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[-_]+/gu, " ");
}
