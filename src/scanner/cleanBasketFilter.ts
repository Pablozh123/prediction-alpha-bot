import type { NegRiskBracketOpportunity } from "./negRiskBracketScanner.js";
import type { ValidatedNegRiskOpportunity } from "./opportunityValidator.js";
import {
  DEFAULT_MAX_SHORT_DURATION_HOURS,
  classifyCapitalLock,
} from "../utils/marketTime.js";
import {
  classifyNegRiskPayoffStructure,
  type NegRiskPayoffStructure,
} from "./negRiskBasketClassifier.js";

export type CleanBasketFilterReason =
  | "clean_basket_validated"
  | "clean_basket_filter_disabled"
  | "missing_basket_sizing"
  | "not_neg_risk_event"
  | "nested_temporal_basket"
  | "multi_winner_or_qualifier_basket"
  | "unknown_payoff_structure"
  | "insufficient_clean_edge"
  | "insufficient_clean_roi"
  | "insufficient_clean_capacity"
  | "insufficient_leg_depth"
  | "wide_leg_spread"
  | "unknown_duration_for_short_arb"
  | "duration_too_long_for_short_arb";

export type CleanBasketFilterOptions = {
  enabled: boolean;
  minEdgeBps: number;
  minRoiBps: number;
  minMaxPositiveBasketCostUsd: number;
  minLegDepthUsd: number;
  maxLegSpreadBps: number;
  maxShortDurationHours: number;
  nowMs?: number;
  /**
   * The scan cycle runs structure (gate 1) and horizon (gate 4) itself, in
   * the order docs/ARB_TAXONOMY.md prescribes, and calls this filter for the
   * executability and economics floors only. Both default to true so the
   * filter stays a complete gauntlet for every other caller.
   */
  checkPayoffStructure?: boolean;
  checkDuration?: boolean;
};

export type CleanBasketFilterResult = {
  valid: boolean;
  reason: CleanBasketFilterReason;
};

export const DEFAULT_CLEAN_BASKET_FILTER_OPTIONS: CleanBasketFilterOptions = {
  enabled: true,
  minEdgeBps: 100,
  minRoiBps: 100,
  minMaxPositiveBasketCostUsd: 100,
  minLegDepthUsd: 100,
  maxLegSpreadBps: 250,
  maxShortDurationHours: DEFAULT_MAX_SHORT_DURATION_HOURS,
};

export function evaluateCleanNegRiskBasket(
  opportunity: NegRiskBracketOpportunity,
  validated: ValidatedNegRiskOpportunity,
  options: Partial<CleanBasketFilterOptions> = {},
): CleanBasketFilterResult {
  const config = {
    ...DEFAULT_CLEAN_BASKET_FILTER_OPTIONS,
    ...options,
  };

  if (!config.enabled) {
    return {
      valid: true,
      reason: "clean_basket_filter_disabled",
    };
  }

  if (config.checkPayoffStructure !== false) {
    const payoff = classifyPayoffStructure(opportunity);

    if (payoff !== "clean") {
      return {
        valid: false,
        reason: payoff,
      };
    }
  }

  if (config.checkDuration !== false) {
    const capitalLock = classifyCapitalLock(
      opportunity.expectedResolutionAt,
      config.nowMs,
    );

    if (capitalLock.capitalLockClass === "unknown") {
      return {
        valid: false,
        reason: "unknown_duration_for_short_arb",
      };
    }

    if (
      capitalLock.capitalLockClass !== "short" ||
      (capitalLock.durationHours ?? Number.POSITIVE_INFINITY) >
        config.maxShortDurationHours
    ) {
      return {
        valid: false,
        reason: "duration_too_long_for_short_arb",
      };
    }
  }

  const sizing = validated.basketSizing;

  if (!sizing) {
    return {
      valid: false,
      reason: "missing_basket_sizing",
    };
  }

  if (sizing.edgeBps < config.minEdgeBps) {
    return {
      valid: false,
      reason: "insufficient_clean_edge",
    };
  }

  if (sizing.roiBps < config.minRoiBps) {
    return {
      valid: false,
      reason: "insufficient_clean_roi",
    };
  }

  if (sizing.maxPositiveBasketCostUsd < config.minMaxPositiveBasketCostUsd) {
    return {
      valid: false,
      reason: "insufficient_clean_capacity",
    };
  }

  if (validated.minLegDepthUsd < config.minLegDepthUsd) {
    return {
      valid: false,
      reason: "insufficient_leg_depth",
    };
  }

  if (maxLegSpreadBps(validated) > config.maxLegSpreadBps) {
    return {
      valid: false,
      reason: "wide_leg_spread",
    };
  }

  return {
    valid: true,
    reason: "clean_basket_validated",
  };
}

type PayoffStructureClassification =
  | "clean"
  | "not_neg_risk_event"
  | "nested_temporal_basket"
  | "multi_winner_or_qualifier_basket"
  | "unknown_payoff_structure";

function classifyPayoffStructure(
  opportunity: NegRiskBracketOpportunity,
): PayoffStructureClassification {
  return classifyNegRiskPayoffStructure({
    eventSlug: opportunity.eventSlug,
    legs: opportunity.legs,
    negRisk: opportunity.negRisk ?? null,
  }) satisfies NegRiskPayoffStructure;
}

function maxLegSpreadBps(validated: ValidatedNegRiskOpportunity): number {
  let maxSpread = 0;

  for (const leg of validated.legs) {
    if (leg.bestBid === null || leg.bestAsk === null) {
      return Number.POSITIVE_INFINITY;
    }

    maxSpread = Math.max(maxSpread, Math.abs(leg.bestAsk - leg.bestBid));
  }

  return Math.round(maxSpread * 10_000 * 100) / 100;
}
