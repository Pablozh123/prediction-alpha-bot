/**
 * Every reason a candidate can be turned down, as one closed list.
 *
 * The May 2026 runs showed that the reason column is the most useful output
 * this scanner produces: 1,030 of 1,206 rejections were the same reason, and
 * that one number said more about the strategy than any edge figure. Free
 * strings drift, so the reasons are an enum here and every path that rejects
 * goes through the counter.
 *
 * Since 2026-09-05 every reason also names the gate it belongs to (see
 * docs/ARB_TAXONOMY.md, section 3): structure before executability before
 * economics before horizon before flow control. A candidate is rejected for
 * the most fundamental reason, not the first one an arbitrary code order
 * happens to hit, and a row that failed gate 1 carries no return figures.
 */

export const REJECTION_REASONS = [
  // gate 1: identity and structure
  "invalid_token_ids",
  "nested_temporal_basket",
  "multi_winner_or_qualifier_basket",
  "unknown_payoff_structure",
  "not_neg_risk_event",
  "compound_kalshi_market",
  "question_type_mismatch",
  "question_inverted",
  "resolution_time_mismatch",
  "resolution_terms_mismatch",
  "rule_review_not_equivalent",
  "pair_config_invalid",
  // gate 2: executability
  "partial_basket_invalid",
  "orderbook_error",
  "missing_fill_price",
  "insufficient_depth_for_target_size",
  "insufficient_leg_depth",
  "wide_leg_spread",
  "missing_basket_sizing",
  // gate 3: economics
  "non_positive_executable_edge",
  "non_positive_net_edge_after_fees",
  "below_min_net_edge",
  "insufficient_clean_edge",
  "insufficient_clean_roi",
  "insufficient_clean_capacity",
  // gate 4: horizon
  "unknown_duration_for_short_arb",
  "duration_too_long_for_short_arb",
  "below_annualized_hurdle",
  // gate 5: flow control
  "duplicate_within_cooldown",
  "near_resolution_watch",
  // infrastructure
  "scanner_error",
  "other",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type RejectionGate = 1 | 2 | 3 | 4 | 5;

const REASON_SET: ReadonlySet<string> = new Set(REJECTION_REASONS);

export function isRejectionReason(value: unknown): value is RejectionReason {
  return typeof value === "string" && REASON_SET.has(value);
}

/**
 * Map an arbitrary reason string onto the enum. Unknown strings become
 * `other`; the original text is the caller's to log, never to count under a
 * name that does not exist.
 */
export function normalizeRejectionReason(value: string | null | undefined): RejectionReason {
  if (isRejectionReason(value)) {
    return value;
  }

  return "other";
}

/** Which gate each reason belongs to; infrastructure failures have none. */
export const REJECTION_GATES: Readonly<Record<RejectionReason, RejectionGate | null>> = {
  invalid_token_ids: 1,
  nested_temporal_basket: 1,
  multi_winner_or_qualifier_basket: 1,
  unknown_payoff_structure: 1,
  not_neg_risk_event: 1,
  compound_kalshi_market: 1,
  question_type_mismatch: 1,
  question_inverted: 1,
  resolution_time_mismatch: 1,
  resolution_terms_mismatch: 1,
  rule_review_not_equivalent: 1,
  pair_config_invalid: 1,
  partial_basket_invalid: 2,
  orderbook_error: 2,
  missing_fill_price: 2,
  insufficient_depth_for_target_size: 2,
  insufficient_leg_depth: 2,
  wide_leg_spread: 2,
  missing_basket_sizing: 2,
  non_positive_executable_edge: 3,
  non_positive_net_edge_after_fees: 3,
  below_min_net_edge: 3,
  insufficient_clean_edge: 3,
  insufficient_clean_roi: 3,
  insufficient_clean_capacity: 3,
  unknown_duration_for_short_arb: 4,
  duration_too_long_for_short_arb: 4,
  below_annualized_hurdle: 4,
  duplicate_within_cooldown: 5,
  near_resolution_watch: 5,
  scanner_error: null,
  other: null,
};

export function gateForReason(reason: string | null | undefined): RejectionGate | null {
  return REJECTION_GATES[normalizeRejectionReason(reason)];
}

/** Human labels for the website; keys are the enum, values plain English. */
export const REJECTION_REASON_LABELS: Readonly<Record<RejectionReason, string>> = {
  invalid_token_ids: "token ids missing or malformed",
  nested_temporal_basket: "legs are nested by date, not exclusive",
  multi_winner_or_qualifier_basket: "legs can pay out more than once",
  unknown_payoff_structure: "payoff structure not classifiable",
  not_neg_risk_event: "venue does not flag the event as mutually exclusive",
  compound_kalshi_market: "Kalshi market bundles several outcomes",
  question_type_mismatch: "titles ask different questions",
  question_inverted: "titles ask the same question in opposite directions",
  resolution_time_mismatch: "resolution times differ",
  resolution_terms_mismatch: "resolution terms differ",
  rule_review_not_equivalent: "a person found the two rulebooks not equivalent",
  pair_config_invalid: "pair configuration invalid",
  partial_basket_invalid: "one leg has no fillable asks",
  orderbook_error: "orderbook fetch failed",
  missing_fill_price: "no average fill price after the walk",
  insufficient_depth_for_target_size: "book too thin for the target size",
  insufficient_leg_depth: "clean-basket leg depth floor not met",
  wide_leg_spread: "leg spread wider than allowed",
  missing_basket_sizing: "basket could not be sized against depth",
  non_positive_executable_edge: "edge gone at executable prices",
  non_positive_net_edge_after_fees: "edge gone after venue fees",
  below_min_net_edge: "net edge below the configured floor",
  insufficient_clean_edge: "clean-basket edge floor not met",
  insufficient_clean_roi: "clean-basket ROI floor not met",
  insufficient_clean_capacity: "clean-basket capacity floor not met",
  unknown_duration_for_short_arb: "resolution time unknown",
  duration_too_long_for_short_arb: "capital lock longer than the short-arb window",
  below_annualized_hurdle: "annualised net return below the hurdle rate",
  duplicate_within_cooldown: "same basket fired within the cooldown",
  near_resolution_watch: "watch candidate, not an executable edge",
  scanner_error: "scanner failed",
  other: "other",
};

export type RejectionCounter = {
  record(reason: string | null | undefined): RejectionReason;
  counts(): Partial<Record<RejectionReason, number>>;
  entries(): Array<{ reason: RejectionReason; count: number }>;
  top(): RejectionReason | null;
  total(): number;
};

export function createRejectionCounter(): RejectionCounter {
  const counts = new Map<RejectionReason, number>();
  let total = 0;

  return {
    record(reason) {
      const normalized = normalizeRejectionReason(reason);

      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      total += 1;

      return normalized;
    },
    counts() {
      return Object.fromEntries(counts) as Partial<Record<RejectionReason, number>>;
    },
    entries() {
      return [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.reason.localeCompare(right.reason),
        );
    },
    top() {
      return this.entries()[0]?.reason ?? null;
    },
    total() {
      return total;
    },
  };
}
