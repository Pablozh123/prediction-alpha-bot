import { describe, expect, it } from "vitest";
import {
  buildForwardReplayReport,
  renderForwardReplayMarkdown,
  type SnapshotReplayRow
} from "../src/scripts/forwardReplayReport.js";

describe("forward replay report", () => {
  it("replays stored orderbook snapshots as quote movement, not PnL", () => {
    const report = buildForwardReplayReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      targetSizeUsd: 1,
      snapshots: [
        makeSnapshot({
          id: "a1",
          tokenId: "token-a",
          bids: [{ price: 0.38, size: 10 }],
          asks: [{ price: 0.4, size: 10 }],
          capturedAt: 1_000
        }),
        makeSnapshot({
          id: "a2",
          tokenId: "token-a",
          bids: [{ price: 0.45, size: 10 }],
          asks: [{ price: 0.47, size: 10 }],
          capturedAt: 61_000
        }),
        makeSnapshot({
          id: "b1",
          tokenId: "token-b",
          bids: [],
          asks: [],
          capturedAt: 1_000
        })
      ]
    });

    expect(report.snapshotCount).toBe(3);
    expect(report.uniqueTokens).toBe(2);
    expect(report.tokensFillableAtTarget).toBe(1);
    expect(report.tokensWithPositiveLatestBidMove).toBe(1);
    expect(report.tokens[0]).toMatchObject({
      tokenId: "token-a",
      snapshots: 2,
      firstAverageEntryAsk: 0.4,
      latestMarkToBidMove: 0.05,
      bestMarkToBidMove: 0.05,
      fillableRate: 1
    });
  });

  it("renders safety language and avoids secrets", () => {
    const report = buildForwardReplayReport({
      dbPath: "logs/test.db",
      generatedAt: "2026-05-20T00:00:00.000Z",
      targetSizeUsd: 1,
      snapshots: []
    });
    const markdown = renderForwardReplayMarkdown(report);

    expect(markdown).toContain("not realized PnL");
    expect(markdown).toContain("No live trading");
    expect(markdown).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(markdown).not.toContain("private-key");
  });
});

function makeSnapshot(
  overrides: Partial<SnapshotReplayRow>
): SnapshotReplayRow {
  const snapshot: SnapshotReplayRow = {
    id: "snapshot-1",
    tokenId: "token",
    marketSlug: "market",
    opportunityId: null,
    source: "test",
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    checksum: null,
    capturedAt: 1_000,
    ...overrides
  };

  return snapshot;
}
