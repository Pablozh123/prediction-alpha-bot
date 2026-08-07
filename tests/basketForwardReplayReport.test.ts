import { describe, expect, it } from "vitest";
import {
  buildBasketForwardReplayReport,
  type BasketReplayLeg,
  type BasketReplayOpportunity,
  type BasketReplaySnapshot
} from "../src/scripts/basketForwardReplayReport.js";

describe("basket forward replay report", () => {
  it("replays a complete linked NEG_RISK basket at basket level", () => {
    const report = buildBasketForwardReplayReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-22T00:00:00.000Z",
      mode: "linked",
      opportunities: [makeOpportunity()],
      legs: makeLegs(),
      snapshots: [
        ...makeEntrySnapshots(),
        ...makeExitSnapshots({
          bids: [0.4, 0.5, 0.6],
          asks: [0.99, 0.99, 0.99]
        })
      ]
    });

    expect(report.summary).toMatchObject({
      total: 1,
      replayed: 1,
      skipped: 0,
      linked: 1
    });
    expect(report.rows[0]).toMatchObject({
      mode: "linked",
      status: "replayed",
      reason: "linked_replay",
      opportunityId: "opportunity-1",
      eventSlug: "event-1",
      legCount: 3,
      basketSizeShares: 1,
      basketCostUsd: 1.8,
      basketPayoutUsd: 2,
      basketProfitUsd: 0.2,
      edgeBps: 2000,
      roiBps: 1111.11,
      latestBidExitUsd: 1.5,
      latestMarkToBidPnlUsd: -0.3,
      latestMarkToBidRoiBps: -1666.67
    });
  });

  it("skips incomplete linked baskets with missing_leg_snapshot", () => {
    const report = buildBasketForwardReplayReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-22T00:00:00.000Z",
      mode: "linked",
      opportunities: [makeOpportunity()],
      legs: makeLegs(),
      snapshots: makeEntrySnapshots().slice(0, 2)
    });

    expect(report.rows[0]).toMatchObject({
      status: "skipped",
      reason: "missing_leg_snapshot"
    });
  });

  it("skips stale linked baskets with stale_leg_snapshot", () => {
    const staleSnapshots = makeEntrySnapshots();
    staleSnapshots[2] = {
      ...staleSnapshots[2]!,
      capturedAt: 1_000_000
    };

    const report = buildBasketForwardReplayReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-22T00:00:00.000Z",
      mode: "linked",
      maxSnapshotStalenessMs: 600_000,
      opportunities: [makeOpportunity()],
      legs: makeLegs(),
      snapshots: staleSnapshots
    });

    expect(report.rows[0]).toMatchObject({
      status: "skipped",
      reason: "stale_leg_snapshot"
    });
  });

  it("marks to bid-side liquidation, not asks or midpoint", () => {
    const report = buildBasketForwardReplayReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-22T00:00:00.000Z",
      mode: "linked",
      opportunities: [makeOpportunity()],
      legs: makeLegs(),
      snapshots: [
        ...makeEntrySnapshots(),
        ...makeExitSnapshots({
          bids: [0.1, 0.1, 0.1],
          asks: [0.99, 0.99, 0.99]
        })
      ]
    });

    expect(report.rows[0]?.latestBidExitUsd).toBe(0.3);
    expect(report.rows[0]?.latestMarkToBidPnlUsd).toBe(-1.5);
  });
});

function makeOpportunity(): BasketReplayOpportunity {
  return {
    id: "opportunity-1",
    strategy: "neg_risk_bracket_arb",
    slug: "event-1",
    timestamp: 1_000
  };
}

function makeLegs(): BasketReplayLeg[] {
  return ["no-1", "no-2", "no-3"].map((tokenId, index) => ({
    opportunityId: "opportunity-1",
    slug: `market-${index + 1}`,
    tokenId,
    legIndex: index
  }));
}

function makeEntrySnapshots(): BasketReplaySnapshot[] {
  return makeLegs().map((leg, index) =>
    makeSnapshot({
      tokenId: leg.tokenId,
      marketSlug: leg.slug,
      opportunityId: "opportunity-1",
      asks: [0.5, 0.6, 0.7][index] ?? 0.5,
      bids: 0.01,
      capturedAt: 1_000 + index * 10
    })
  );
}

function makeExitSnapshots(input: {
  bids: number[];
  asks: number[];
}): BasketReplaySnapshot[] {
  return makeLegs().map((leg, index) =>
    makeSnapshot({
      tokenId: leg.tokenId,
      marketSlug: leg.slug,
      opportunityId: null,
      asks: input.asks[index] ?? 0.99,
      bids: input.bids[index] ?? 0.01,
      capturedAt: 2_000 + index * 10
    })
  );
}

function makeSnapshot(input: {
  tokenId: string;
  marketSlug: string | null;
  opportunityId: string | null;
  asks: number;
  bids: number;
  capturedAt: number;
}): BasketReplaySnapshot {
  return {
    id: `${input.tokenId}-${input.capturedAt}`,
    tokenId: input.tokenId,
    marketSlug: input.marketSlug,
    eventSlug: "event-1",
    marketId: input.marketSlug,
    side: "NO",
    opportunityId: input.opportunityId,
    bids: [{ price: input.bids, size: 10 }],
    asks: [{ price: input.asks, size: 10 }],
    capturedAt: input.capturedAt
  };
}
