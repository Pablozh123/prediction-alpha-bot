import { describe, expect, it } from "vitest";
import {
  buildCoverageReport,
  buildNegRiskNearMisses,
  buildWithinMarketNearMisses,
  renderCoverageMarkdown,
  type CoverageSnapshot,
} from "../src/scripts/coverageReport.js";

const baseTime = 1_800_000_000_000;

function snapshot(
  input: Partial<CoverageSnapshot> & Pick<CoverageSnapshot, "tokenId">,
): CoverageSnapshot {
  return {
    bestAsk: 0.5,
    bestBid: 0.49,
    capturedAt: baseTime,
    eventSlug: null,
    marketId: "market-1",
    marketSlug: "market-one",
    side: null,
    strategySource: "test",
    ...input,
  };
}

describe("coverage report", () => {
  it("computes within-market near misses from fresh YES and NO snapshots", () => {
    const nearMisses = buildWithinMarketNearMisses(
      [
        snapshot({
          tokenId: "yes-token",
          side: "YES",
          bestAsk: 0.47,
        }),
        snapshot({
          tokenId: "no-token",
          side: "NO",
          bestAsk: 0.5,
          capturedAt: baseTime + 1_000,
        }),
      ],
      { threshold: 0.98 },
    );

    expect(nearMisses).toEqual([
      expect.objectContaining({
        askNo: 0.5,
        askYes: 0.47,
        distanceToThreshold: -0.01,
        expectedEdge: 0.03,
        status: "candidate",
        totalCost: 0.97,
      }),
    ]);
  });

  it("excludes stale within-market snapshot pairs", () => {
    const nearMisses = buildWithinMarketNearMisses(
      [
        snapshot({
          tokenId: "yes-token",
          side: "YES",
          bestAsk: 0.47,
        }),
        snapshot({
          tokenId: "no-token",
          side: "NO",
          bestAsk: 0.5,
          capturedAt: baseTime + 700_000,
        }),
      ],
      { maxSnapshotStalenessMs: 600_000 },
    );

    expect(nearMisses).toEqual([]);
  });

  it("computes NEG_RISK basket near misses from complete NO-leg snapshots", () => {
    const nearMisses = buildNegRiskNearMisses([
      snapshot({
        tokenId: "no-1",
        eventSlug: "event-one",
        marketId: "m1",
        marketSlug: "one",
        side: "NO",
        bestAsk: 0.62,
      }),
      snapshot({
        tokenId: "no-2",
        eventSlug: "event-one",
        marketId: "m2",
        marketSlug: "two",
        side: "NO",
        bestAsk: 0.67,
        capturedAt: baseTime + 1_000,
      }),
      snapshot({
        tokenId: "no-3",
        eventSlug: "event-one",
        marketId: "m3",
        marketSlug: "three",
        side: "NO",
        bestAsk: 0.68,
        capturedAt: baseTime + 2_000,
      }),
    ]);

    expect(nearMisses).toEqual([
      expect.objectContaining({
        edgeBps: 300,
        eventSlug: "event-one",
        executableSum: 1.97,
        expectedGrossEdge: 0.03,
        legCount: 3,
        theoreticalPayout: 2,
      }),
    ]);
  });

  it("separates scanner coverage warnings from PnL claims", () => {
    const report = buildCoverageReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-22T00:00:00.000Z",
      scanCycles: Array.from({ length: 61 }, (_, index) => ({
        timestamp: baseTime + index,
        success: 1,
        opportunities: 0,
        paperTrades: 0,
        rejectedOpportunities: 0,
        skippedDuplicates: 0,
      })),
    });
    const markdown = renderCoverageMarkdown(report);

    expect(report.warnings).toContain(
      "NO_RAW_OPPORTUNITIES_AFTER_60_CYCLES: scanner coverage may be too narrow.",
    );
    expect(markdown).toContain("Near misses are diagnostics");
    expect(markdown).not.toContain("private_key");
    expect(markdown).not.toContain("placeOrder");
  });
});
