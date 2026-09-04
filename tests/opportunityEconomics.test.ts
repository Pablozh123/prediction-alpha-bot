import { describe, expect, it } from "vitest";
import {
  annualizedPct,
  bpsAtLeast,
  computeBasketEconomics,
  daysToResolution,
  isPositiveBps,
  toBps,
} from "../src/core/opportunityEconomics.js";
import {
  createRejectionCounter,
  isRejectionReason,
  normalizeRejectionReason,
  REJECTION_REASONS,
} from "../src/core/rejectionReasons.js";

const DAY = 86_400_000;

describe("opportunity economics", () => {
  it("computes days to resolution and returns null when unknown", () => {
    expect(daysToResolution(10 * DAY, 0)).toBe(10);
    expect(daysToResolution(null, 0)).toBeNull();
    expect(daysToResolution(undefined, 0)).toBeNull();
    // resolution already passed clamps to zero rather than going negative
    expect(daysToResolution(0, DAY)).toBe(0);
  });

  it("annualises linearly with a one-day floor", () => {
    // 2 cents on 30 cents over 830 days: 6.67% * 365/830 = 2.93% a year
    expect(annualizedPct(2, 30, 830)).toBe(2.93);
    // 1% over half a day is treated as 1% a day, not 1% every twelve hours
    expect(annualizedPct(1, 100, 0.5)).toBe(365);
    expect(annualizedPct(1, 100, null)).toBeNull();
    expect(annualizedPct(1, 0, 10)).toBeNull();
  });

  it("prices a YES+NO basket against walked fills, fees, and horizon", () => {
    const economics = computeBasketEconomics({
      legs: [
        { venue: "polymarket", side: "YES", averageFillPrice: 0.45, shares: 20 },
        { venue: "polymarket", side: "NO", averageFillPrice: 0.5, shares: 20 },
      ],
      payoutPerBasketShare: 1,
      roleMode: "taker",
      expectedResolutionAt: 2 * DAY,
      nowMs: 0,
    });

    // capital 20 * 0.95 = 19, payout 20, gross 1.00
    expect(economics.capitalUsd).toBe(19);
    expect(economics.grossProfitUsd).toBe(1);
    // fees: 20 * 0.05 * (0.45*0.55) + 20 * 0.05 * 0.25 = 0.2475 + 0.25
    expect(economics.feeUsd).toBeCloseTo(0.4975, 6);
    expect(economics.netProfitUsd).toBeCloseTo(0.5025, 6);
    expect(economics.grossEdgeBps).toBe(526.32);
    expect(economics.executableNetEdgeBps).toBe(264.47);
    expect(economics.daysToResolution).toBe(2);
    // 2.6447% * 365 / 2
    expect(economics.annualizedPct).toBe(482.66);
    expect(economics.legs.map((leg) => leg.role)).toEqual(["taker", "taker"]);
  });

  it("lets a maker-first configuration rest the most expensive leg", () => {
    const economics = computeBasketEconomics({
      legs: [
        { venue: "kalshi", side: "YES", averageFillPrice: 0.5, shares: 100 },
        { venue: "polymarket", side: "NO", averageFillPrice: 0.47, shares: 100 },
      ],
      payoutPerBasketShare: 1,
      roleMode: "maker_first",
    });

    expect(economics.legs.map((leg) => `${leg.venue}:${leg.role}`)).toEqual([
      "kalshi:maker",
      "polymarket:taker",
    ]);
    // kalshi maker 100 * 0.0175 * 0.25 = 0.4375 -> 0.44; polymarket taker 100*0.05*0.2491
    expect(economics.legs[0]?.feeUsd).toBe(0.44);
    expect(economics.legs[1]?.feeUsd).toBeCloseTo(1.2455, 6);
  });

  it("sizes the basket at the shallowest leg", () => {
    const economics = computeBasketEconomics({
      legs: [
        { venue: "polymarket", side: "NO", averageFillPrice: 0.35, shares: 10 },
        { venue: "polymarket", side: "NO", averageFillPrice: 0.4, shares: 4 },
        { venue: "polymarket", side: "NO", averageFillPrice: 0.9, shares: 7 },
      ],
      payoutPerBasketShare: 2,
      roleMode: "taker",
    });

    expect(economics.basketShares).toBe(4);
    expect(economics.capitalUsd).toBe(6.6);
    expect(economics.payoutUsd).toBe(8);
  });

  it("compares basis-point thresholds without float surprises", () => {
    expect(toBps(0.03, 0.97)).toBe(309.28);
    expect(bpsAtLeast((1 - 0.07) * 10_000 - 9_300, 0)).toBe(true);
    expect(isPositiveBps(0.004)).toBe(false);
    expect(isPositiveBps(0.005)).toBe(true);
  });
});

describe("rejection reasons", () => {
  it("is a closed list that unknown strings fall out of as other", () => {
    expect(isRejectionReason("non_positive_executable_edge")).toBe(true);
    expect(isRejectionReason("something_new")).toBe(false);
    expect(normalizeRejectionReason("something_new")).toBe("other");
    expect(normalizeRejectionReason(null)).toBe("other");
    expect(new Set(REJECTION_REASONS).size).toBe(REJECTION_REASONS.length);
  });

  it("counts and ranks reasons", () => {
    const counter = createRejectionCounter();

    counter.record("non_positive_executable_edge");
    counter.record("non_positive_executable_edge");
    counter.record("partial_basket_invalid");
    counter.record("free text reason");

    expect(counter.total()).toBe(4);
    expect(counter.top()).toBe("non_positive_executable_edge");
    expect(counter.entries()).toEqual([
      { reason: "non_positive_executable_edge", count: 2 },
      { reason: "other", count: 1 },
      { reason: "partial_basket_invalid", count: 1 },
    ]);
    expect(counter.counts()).toEqual({
      non_positive_executable_edge: 2,
      partial_basket_invalid: 1,
      other: 1,
    });
  });
});
