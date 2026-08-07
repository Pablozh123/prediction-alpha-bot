import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NEG_RISK_SNAPSHOT_MAX_STALENESS_MS,
  NEG_RISK_SNAPSHOT_REASON,
  scanNegRiskSnapshotRows,
  type NegRiskSnapshotRow,
} from "../src/scanner/negRiskSnapshotScanner.js";

const baseTime = 1_800_000_000_000;

describe("scanNegRiskSnapshotRows", () => {
  it("creates a snapshot-derived NO basket candidate with positive edge", () => {
    expect(
      scanNegRiskSnapshotRows([
        makeSnapshot({ marketId: "m1", tokenId: "no-1", bestAsk: 0.5 }),
        makeSnapshot({ marketId: "m2", tokenId: "no-2", bestAsk: 0.6 }),
        makeSnapshot({
          marketId: "m3",
          tokenId: "no-3",
          bestAsk: 0.7,
          expectedResolutionAt: baseTime + 60_000,
        }),
      ]),
    ).toEqual([
      {
        eventSlug: "event-one",
        sumYes: null,
        threshold: 2,
        expectedEdge: 0.2,
        expectedResolutionAt: baseTime + 60_000,
        reason: NEG_RISK_SNAPSHOT_REASON,
        legs: [
          expect.objectContaining({
            marketId: "m1",
            noTokenId: "no-1",
            sideToPaperTrade: "NO",
          }),
          expect.objectContaining({
            marketId: "m2",
            noTokenId: "no-2",
            sideToPaperTrade: "NO",
          }),
          expect.objectContaining({
            marketId: "m3",
            noTokenId: "no-3",
            sideToPaperTrade: "NO",
          }),
        ],
      },
    ]);
  });

  it("skips stale or incomplete baskets", () => {
    const warn = vi.fn();

    expect(
      scanNegRiskSnapshotRows(
        [
          makeSnapshot({ marketId: "m1", tokenId: "no-1", bestAsk: 0.5 }),
          makeSnapshot({ marketId: "m2", tokenId: "no-2", bestAsk: 0.6 }),
          makeSnapshot({
            marketId: "m3",
            tokenId: "no-3",
            bestAsk: 0.7,
            capturedAt:
              baseTime + DEFAULT_NEG_RISK_SNAPSHOT_MAX_STALENESS_MS + 1,
          }),
        ],
        { warn },
      ),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping snapshot NEG_RISK event "event-one": stale leg snapshots.',
    );

    expect(
      scanNegRiskSnapshotRows([
        makeSnapshot({ marketId: "m1", tokenId: "no-1", bestAsk: 0.5 }),
        makeSnapshot({ marketId: "m2", tokenId: "no-2", bestAsk: 0.6 }),
      ]),
    ).toEqual([]);
  });

  it("skips non-positive basket edges and overly broad baskets", () => {
    const warn = vi.fn();

    expect(
      scanNegRiskSnapshotRows([
        makeSnapshot({ marketId: "m1", tokenId: "no-1", bestAsk: 0.9 }),
        makeSnapshot({ marketId: "m2", tokenId: "no-2", bestAsk: 0.9 }),
        makeSnapshot({ marketId: "m3", tokenId: "no-3", bestAsk: 0.9 }),
      ]),
    ).toEqual([]);

    expect(
      scanNegRiskSnapshotRows(
        Array.from({ length: 17 }, (_, index) =>
          makeSnapshot({
            marketId: `m${index}`,
            marketSlug: `market-${index}`,
            tokenId: `no-${index}`,
            bestAsk: 0.1,
          }),
        ),
        { warn },
      ),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping snapshot NEG_RISK event "event-one": too many legs (17).',
    );
  });

  it("keeps older timing metadata when the latest token snapshot lacks it", () => {
    const expectedResolutionAt = baseTime + 86_400_000;

    expect(
      scanNegRiskSnapshotRows([
        makeSnapshot({
          marketId: "m1",
          tokenId: "no-1",
          bestAsk: 0.51,
          capturedAt: baseTime,
          expectedResolutionAt,
        }),
        makeSnapshot({
          marketId: "m1",
          tokenId: "no-1",
          bestAsk: 0.5,
          capturedAt: baseTime + 1,
        }),
        makeSnapshot({ marketId: "m2", tokenId: "no-2", bestAsk: 0.6 }),
        makeSnapshot({ marketId: "m3", tokenId: "no-3", bestAsk: 0.7 }),
      ])[0],
    ).toMatchObject({
      expectedResolutionAt,
    });
  });
});

function makeSnapshot(
  overrides: Partial<NegRiskSnapshotRow>,
): NegRiskSnapshotRow {
  return {
    bestAsk: 0.5,
    capturedAt: baseTime,
    eventSlug: "event-one",
    marketId: "m1",
    marketSlug: "market-one",
    side: "NO",
    tokenId: "no-token",
    ...overrides,
  };
}
