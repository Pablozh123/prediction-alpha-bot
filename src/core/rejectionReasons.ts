/**
 * Every reason a candidate can be turned down, as one closed list.
 *
 * The May 2026 runs showed that the reason column is the most useful output
 * this scanner produces: 1,030 of 1,206 rejections were the same reason, and
 * that one number said more about the strategy than any edge figure. Free
 * strings drift, so the reasons are an enum here and every path that rejects
 * goes through the counter.
 */

export const REJECTION_REASONS = [
  // book / fill
  "partial_basket_invalid",
  "invalid_token_ids",
  "orderbook_error",
  "missing_fill_price",
  "insufficient_depth_for_target_size",
  // economics
  "non_positive_executable_edge",
  "non_positive_net_edge_after_fees",
  "below_min_net_edge",
  "insufficient_clean_edge",
  "insufficient_clean_roi",
  "insufficient_clean_capacity",
  "insufficient_leg_depth",
  "wide_leg_spread",
  // basket structure
  "missing_basket_sizing",
  "nested_temporal_basket",
  "multi_winner_or_qualifier_basket",
  "unknown_payoff_structure",
  // capital lock
  "unknown_duration_for_short_arb",
  "duration_too_long_for_short_arb",
  // flow control
  "duplicate_within_cooldown",
  "near_resolution_watch",
  // cross-venue matching
  "compound_kalshi_market",
  "question_type_mismatch",
  "question_inverted",
  "resolution_time_mismatch",
  "resolution_terms_mismatch",
  "pair_config_invalid",
  // infrastructure
  "scanner_error",
  "other",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

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

/** Human labels for the website; keys are the enum, values plain English. */
export const REJECTION_REASON_LABELS: Readonly<Record<RejectionReason, string>> = {
  partial_basket_invalid: "one leg has no fillable asks",
  invalid_token_ids: "token ids missing or malformed",
  orderbook_error: "orderbook fetch failed",
  missing_fill_price: "no average fill price after the walk",
  insufficient_depth_for_target_size: "book too thin for the target size",
  non_positive_executable_edge: "edge gone at executable prices",
  non_positive_net_edge_after_fees: "edge gone after venue fees",
  below_min_net_edge: "net edge below the configured floor",
  insufficient_clean_edge: "clean-basket edge floor not met",
  insufficient_clean_roi: "clean-basket ROI floor not met",
  insufficient_clean_capacity: "clean-basket capacity floor not met",
  insufficient_leg_depth: "clean-basket leg depth floor not met",
  wide_leg_spread: "leg spread wider than allowed",
  missing_basket_sizing: "basket could not be sized against depth",
  nested_temporal_basket: "legs are nested by date, not exclusive",
  multi_winner_or_qualifier_basket: "legs can pay out more than once",
  unknown_payoff_structure: "payoff structure not classifiable",
  unknown_duration_for_short_arb: "resolution time unknown",
  duration_too_long_for_short_arb: "capital lock longer than the short-arb window",
  duplicate_within_cooldown: "same basket fired within the cooldown",
  near_resolution_watch: "watch candidate, not an executable edge",
  compound_kalshi_market: "Kalshi market bundles several outcomes",
  question_type_mismatch: "titles ask different questions",
  question_inverted: "titles ask the same question in opposite directions",
  resolution_time_mismatch: "resolution times differ",
  resolution_terms_mismatch: "resolution terms differ",
  pair_config_invalid: "pair configuration invalid",
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
