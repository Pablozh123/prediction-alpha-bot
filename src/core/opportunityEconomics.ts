/**
 * The economics of one basket priced against the book that would fill it.
 *
 * Every strategy in this repository buys a set of legs that together pay out a
 * fixed amount per basket share at resolution: YES + NO pays 1.00, a NEG_RISK
 * NO basket with k legs pays k - 1. Capital is what the legs cost at their
 * walked average fill prices, fees come from the venue curves, and the two
 * fields that decide the ranking - days to resolution and annualised return -
 * turn a cents figure into something comparable with simply holding the
 * collateral.
 *
 * The 2026-07-31 cross-venue study found gaps that stood open for hours: not
 * arbitrage, but the price of locked capital at roughly one percent a year.
 * That is why `annualizedPct` is a required output and why nothing here is a
 * chance until `executableNetEdgeBps` is positive at the executable size.
 */

import {
  assignLegRoles,
  legFeeUsd,
  type ExecutionRoleMode,
  type FeeVenue,
  type LegRole,
} from "./venueFees.js";

export const MS_PER_DAY = 86_400_000;

/**
 * The annualised net return a structural basket has to clear before its
 * locked capital counts as a chance rather than as a funding premium. The
 * market itself prices locked collateral in near-certain contracts at roughly
 * three to seven percent a year (Gebele and Matthes, cited in the sibling
 * project's ertragsquellen note of 2026-07-31); below that a gap is the price
 * of the wait, not an edge. Decision E1 of docs/ARB_TAXONOMY.md: ten percent
 * as the starting value, configurable as MIN_ANNUALIZED_NET_PCT and published
 * in the feed so the number is never implied.
 */
export const DEFAULT_MIN_ANNUALIZED_NET_PCT = 10;

/**
 * Threshold comparison for the hurdle. An unknown annualised return never
 * clears it: an undated basket is not a chance.
 */
export function meetsAnnualizedHurdle(
  annualizedPct: number | null | undefined,
  hurdlePct: number,
): boolean {
  if (annualizedPct === null || annualizedPct === undefined || !Number.isFinite(annualizedPct)) {
    return false;
  }

  return round2(annualizedPct) >= round2(hurdlePct);
}

/**
 * Below this horizon the annualised figure is clamped to one day. A basket
 * that resolves in two hours is not repeatable 4,380 times a year; clamping
 * keeps the number an upper bound on a same-day roll rather than a fantasy.
 */
export const MIN_ANNUALIZATION_DAYS = 1;

export type EconomicsLegInput = {
  venue: FeeVenue;
  side: "YES" | "NO";
  averageFillPrice: number;
  shares: number;
  category?: string | null;
  role?: LegRole;
};

export type EconomicsLeg = EconomicsLegInput & {
  role: LegRole;
  sizeUsd: number;
  feeUsd: number;
};

export type BasketEconomics = {
  legs: EconomicsLeg[];
  basketShares: number;
  payoutPerBasketShare: number;
  capitalUsd: number;
  payoutUsd: number;
  grossProfitUsd: number;
  feeUsd: number;
  netProfitUsd: number;
  grossEdgeBps: number;
  executableNetEdgeBps: number;
  daysToResolution: number | null;
  annualizedPct: number | null;
};

export type ComputeBasketEconomicsInput = {
  legs: EconomicsLegInput[];
  payoutPerBasketShare: number;
  roleMode?: ExecutionRoleMode;
  expectedResolutionAt?: number | null;
  nowMs?: number;
};

export function daysToResolution(
  expectedResolutionAt: number | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (
    expectedResolutionAt === null ||
    expectedResolutionAt === undefined ||
    !Number.isFinite(expectedResolutionAt)
  ) {
    return null;
  }

  return round4(Math.max(0, (expectedResolutionAt - nowMs) / MS_PER_DAY));
}

/**
 * Linear annualisation of a holding-period return, in percent.
 *
 * Linear rather than compounded on purpose: compounding a 79-cent gap over four
 * days gives 1e63 percent, which is arithmetic without meaning. Linear scaling
 * says "this return, if it could be rolled every `days` days for a year", and
 * is bounded by the one-day clamp.
 */
export function annualizedPct(
  netProfitUsd: number,
  capitalUsd: number,
  days: number | null | undefined,
): number | null {
  if (
    days === null ||
    days === undefined ||
    !Number.isFinite(days) ||
    !Number.isFinite(capitalUsd) ||
    capitalUsd <= 0 ||
    !Number.isFinite(netProfitUsd)
  ) {
    return null;
  }

  const horizonDays = Math.max(MIN_ANNUALIZATION_DAYS, days);

  return round2((netProfitUsd / capitalUsd) * (365 / horizonDays) * 100);
}

/** Basis points of `part` over `base`, rounded to two decimals. */
export function toBps(part: number, base: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(base) || base <= 0) {
    return 0;
  }

  return round2((part / base) * 10_000);
}

export function computeBasketEconomics(
  input: ComputeBasketEconomicsInput,
): BasketEconomics {
  const nowMs = input.nowMs ?? Date.now();
  const roleMode = input.roleMode ?? "taker";
  const basketShares = input.legs.length === 0
    ? 0
    : Math.min(...input.legs.map((leg) => (Number.isFinite(leg.shares) ? leg.shares : 0)));
  const priced = input.legs.map((leg) => ({
    ...leg,
    price: leg.averageFillPrice,
  }));
  const withRoles = input.legs.every((leg) => leg.role !== undefined)
    ? priced.map((leg) => ({ ...leg, role: leg.role as LegRole }))
    : assignLegRoles(priced, roleMode);

  const legs: EconomicsLeg[] = withRoles.map((leg) => {
    const shares = Math.max(0, basketShares);
    const sizeUsd = roundUsd(shares * leg.averageFillPrice);
    const feeUsd = legFeeUsd({
      venue: leg.venue,
      role: leg.role,
      price: leg.averageFillPrice,
      shares,
      category: leg.category,
    });

    return {
      venue: leg.venue,
      side: leg.side,
      averageFillPrice: leg.averageFillPrice,
      shares,
      category: leg.category ?? null,
      role: leg.role,
      sizeUsd,
      feeUsd,
    };
  });

  const capitalUsd = roundUsd(legs.reduce((sum, leg) => sum + leg.sizeUsd, 0));
  const payoutUsd = roundUsd(basketShares * input.payoutPerBasketShare);
  const grossProfitUsd = roundUsd(payoutUsd - capitalUsd);
  const feeUsd = roundUsd(legs.reduce((sum, leg) => sum + leg.feeUsd, 0));
  const netProfitUsd = roundUsd(grossProfitUsd - feeUsd);
  const days = daysToResolution(input.expectedResolutionAt, nowMs);

  return {
    legs,
    basketShares: round6(basketShares),
    payoutPerBasketShare: input.payoutPerBasketShare,
    capitalUsd,
    payoutUsd,
    grossProfitUsd,
    feeUsd,
    netProfitUsd,
    grossEdgeBps: toBps(grossProfitUsd, capitalUsd),
    executableNetEdgeBps: toBps(netProfitUsd, capitalUsd),
    daysToResolution: days,
    annualizedPct: annualizedPct(netProfitUsd, capitalUsd, days),
  };
}

/**
 * Threshold comparison that survives JS float noise: both sides are rounded to
 * two decimals of a basis point before comparing. `1 - 0.07 >= 0.93` is false
 * in JavaScript; this is not.
 */
export function bpsAtLeast(valueBps: number, thresholdBps: number): boolean {
  return round2(valueBps) >= round2(thresholdBps);
}

export function isPositiveBps(valueBps: number): boolean {
  return round2(valueBps) > 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
