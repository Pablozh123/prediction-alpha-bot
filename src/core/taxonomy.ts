/**
 * The taxonomy every candidate is described on, as one closed vocabulary.
 *
 * Four axes, defined in docs/ARB_TAXONOMY.md:
 *
 * - class: the payoff structure of the basket and whether it is structural
 *   at all (only structural classes may be called arbitrage);
 * - capital lock: how long the collateral sits until resolution (a horizon,
 *   never a rejection);
 * - rule screen: what the automated title and rule-text checks noticed;
 * - rule review: what a person decided after reading both rulebooks.
 *
 * The scanner writes these words into the journal and the published feed;
 * the website renders them from the feed's `vocabulary` block instead of
 * typing its own. Nothing here touches an order path.
 */

import type { CapitalLockClass } from "../utils/marketTime.js";

export const OPPORTUNITY_CLASSES = [
  "same_market_complement",
  "neg_risk_no_basket",
  "cross_venue_complement",
  "cross_venue_price_spread",
  "neg_risk_long_tail_no_carry",
  "clear_win_convergence",
] as const;

export type OpportunityClass = (typeof OPPORTUNITY_CLASSES)[number];

export type OpportunityClassDefinition = {
  id: OpportunityClass;
  label: string;
  basket: string;
  payout: string;
  /** Under which condition the payout is fixed by contract. Null: never. */
  structuralWhen: string | null;
  mainRisk: string;
  /** Whether a scanner strategy currently produces rows of this class. */
  scanned: boolean;
};

export const CLASS_DEFINITIONS: readonly OpportunityClassDefinition[] = [
  {
    id: "same_market_complement",
    label: "YES plus NO in one market",
    basket: "YES and NO of the same contract on one venue",
    payout: "exactly 1.00 per basket share",
    structuralWhen: "always: one contract, one rulebook",
    mainRisk: "the book is gone within seconds; the fee curve",
    scanned: true,
  },
  {
    id: "neg_risk_no_basket",
    label: "NO on every leg of a NEG_RISK event",
    basket: "NO on all N legs of one mutually exclusive event",
    payout: "N minus the number of winners",
    structuralWhen:
      "the venue flags the event NEG_RISK, exactly one leg can win, and the legs are exhaustive or carry an Other leg",
    mainRisk: "multi-winner or nested-date legs, a missing Other leg, a UMA dispute",
    scanned: true,
  },
  {
    id: "cross_venue_complement",
    label: "YES on one venue, NO on the other",
    basket: "YES on venue A and NO on venue B for the same question",
    payout: "1.00 only when both rulebooks resolve identically, else 0 or 2",
    structuralWhen:
      "the automated screen passed and a person found both rulebooks equivalent",
    mainRisk:
      "rulebooks, two resolution dates, two collateral pools without netting, legging",
    scanned: true,
  },
  {
    id: "cross_venue_price_spread",
    label: "same side, two prices",
    basket: "none: the same outcome quoted on two venues",
    payout: "none",
    structuralWhen: null,
    mainRisk: "not a chance at all; information about where the outcome is cheaper",
    scanned: true,
  },
  {
    id: "neg_risk_long_tail_no_carry",
    label: "NO on long-tail legs, held to resolution",
    basket: "NO on legs priced at NO 0.97 or better inside a NEG_RISK event",
    payout: "1.00 per leg unless that leg wins",
    structuralWhen: null,
    mainRisk: "a long-tail leg wins",
    scanned: false,
  },
  {
    id: "clear_win_convergence",
    label: "settled outcome not yet priced",
    basket: "YES or NO on a market whose outcome is already known",
    payout: "1.00 when the reference fact and the oracle agree",
    structuralWhen: null,
    mainRisk: "the oracle resolves against the reference fact",
    scanned: true,
  },
];

export const CLASS_LABELS: Readonly<Record<OpportunityClass, string>> = Object.fromEntries(
  CLASS_DEFINITIONS.map((definition) => [definition.id, definition.label]),
) as Record<OpportunityClass, string>;

/** Classes whose payout is fixed by contract once their condition holds. */
export const STRUCTURAL_CLASSES: ReadonlySet<OpportunityClass> = new Set(
  CLASS_DEFINITIONS.filter((definition) => definition.structuralWhen !== null).map(
    (definition) => definition.id,
  ),
);

export const STRATEGY_CLASS: Readonly<Record<string, OpportunityClass>> = {
  within_market_fast_arb: "same_market_complement",
  within_market_yes_no_arb: "same_market_complement",
  neg_risk_bracket_arb: "neg_risk_no_basket",
  cross_venue_yes_no_arb: "cross_venue_complement",
  cross_venue_price_spread: "cross_venue_price_spread",
  clear_win_watch: "clear_win_convergence",
};

export function classForStrategy(strategy: string | null | undefined): OpportunityClass | null {
  return (strategy && STRATEGY_CLASS[strategy]) || null;
}

export function isStructuralClass(value: OpportunityClass | null | undefined): boolean {
  return value !== null && value !== undefined && STRUCTURAL_CLASSES.has(value);
}

/**
 * Horizon labels. `short` is the only horizon that paper-fires; the other
 * two are carry and are published as candidates, never as rejections.
 */
export const CAPITAL_LOCK_LABELS: Readonly<Record<CapitalLockClass, string>> = {
  short: "ARB: resolves within 72 h",
  medium: "CARRY, short: 72 h to 14 days",
  long: "CARRY, long: over 14 days",
  unknown: "UNDATED: no resolution time known",
};

export const RULE_SCREEN_STATUSES = [
  "structural",
  "passed",
  "inverted",
  "different_question",
  "compound_market",
  "resolution_time_mismatch",
  "resolution_terms_mismatch",
] as const;

export type RuleScreenStatus = (typeof RULE_SCREEN_STATUSES)[number];

export const RULE_SCREEN_LABELS: Readonly<Record<RuleScreenStatus, string>> = {
  structural: "one contract: equivalence by construction",
  passed: "nothing noticed by the automated screen; not verified",
  inverted: "the two titles ask the same question in opposite directions",
  different_question: "the two titles ask different questions",
  compound_market: "one side bundles several outcomes",
  resolution_time_mismatch: "resolution times differ by more than the tolerance",
  resolution_terms_mismatch: "resolution terms differ",
};

export const RULE_REVIEW_STATUSES = ["none", "pending", "equivalent", "not_equivalent"] as const;

export type RuleReviewStatus = (typeof RULE_REVIEW_STATUSES)[number];

export const RULE_REVIEW_LABELS: Readonly<Record<RuleReviewStatus, string>> = {
  none: "no person has read both rulebooks",
  pending: "a draft review exists and has not been confirmed",
  equivalent: "a person read both rulebooks and found them equivalent",
  not_equivalent: "a person read both rulebooks and found them different",
};

export function isRuleScreenStatus(value: unknown): value is RuleScreenStatus {
  return typeof value === "string" && (RULE_SCREEN_STATUSES as readonly string[]).includes(value);
}

export function isRuleReviewStatus(value: unknown): value is RuleReviewStatus {
  return typeof value === "string" && (RULE_REVIEW_STATUSES as readonly string[]).includes(value);
}

/** The screen status a cross-venue rejection reason implies, if any. */
export function ruleScreenFromRejection(reason: string | null | undefined): RuleScreenStatus | null {
  switch (reason) {
    case "question_inverted":
      return "inverted";
    case "question_type_mismatch":
      return "different_question";
    case "compound_kalshi_market":
      return "compound_market";
    case "resolution_time_mismatch":
      return "resolution_time_mismatch";
    case "resolution_terms_mismatch":
      return "resolution_terms_mismatch";
    default:
      return null;
  }
}

/**
 * Only two states allow the word "hedged": equivalence by construction, or a
 * person who read both rulebooks and found them equivalent. The person's
 * verdict outranks the automated screen in both directions: the screen reads
 * titles and dates, the review read the rulebooks, and the dates are the
 * seventh question of its checklist.
 */
export function isHedged(
  screen: RuleScreenStatus | null | undefined,
  review: RuleReviewStatus | null | undefined,
): boolean {
  if (review === "equivalent") {
    return true;
  }

  if (review === "not_equivalent") {
    return false;
  }

  return screen === "structural";
}

/** The rejection reason a failed automated screen produces, if any. */
export function rejectionFromRuleScreen(
  screen: RuleScreenStatus | null | undefined,
): "question_inverted" | "question_type_mismatch" | "compound_kalshi_market" | "resolution_time_mismatch" | "resolution_terms_mismatch" | null {
  switch (screen) {
    case "inverted":
      return "question_inverted";
    case "different_question":
      return "question_type_mismatch";
    case "compound_market":
      return "compound_kalshi_market";
    case "resolution_time_mismatch":
      return "resolution_time_mismatch";
    case "resolution_terms_mismatch":
      return "resolution_terms_mismatch";
    default:
      return null;
  }
}

/**
 * The single `rule_match` field of the first feed schema, derived from the
 * two new fields. `reviewed` there means "found equivalent": by a person
 * for a cross-venue pair, by construction for a single contract. A NEG_RISK
 * basket that only passed the automated screen is `unverified`, which is
 * what the first schema's readers were told the word means.
 */
export function legacyRuleMatch(
  screen: RuleScreenStatus | null | undefined,
  review: RuleReviewStatus | null | undefined,
): "unverified" | "reviewed" | "mismatch" {
  if (review === "not_equivalent") {
    return "mismatch";
  }

  if (screen === "structural") {
    return "reviewed";
  }

  if (screen && screen !== "passed") {
    return "mismatch";
  }

  return review === "equivalent" ? "reviewed" : "unverified";
}

export const GATE_LABELS: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = {
  1: "identity and structure",
  2: "executability",
  3: "economics",
  4: "horizon",
  5: "flow control",
};
