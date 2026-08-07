import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  listRecentOrderBookSnapshots,
  recordOrderBookSnapshot
} from "../src/execution/orderbookSnapshotJournal.js";

const testDbPath = join("logs", "orderbook-snapshot-test.db");

describe("orderbook snapshot journal", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("records current orderbook snapshots for future forward replay", () => {
    const snapshot = recordOrderBookSnapshot({
      tokenId: "token-1",
      marketSlug: "example-market",
      eventSlug: "example-event",
      marketId: "market-1",
      side: "NO",
      strategySource: "neg_risk_bracket_arb",
      expectedResolutionAt: 1_700_086_400_000,
      opportunityId: "opportunity-1",
      capturedAt: 1_700_000_000_000,
      orderbook: {
        tokenId: "token-1",
        bids: [{ price: 0.41, size: 10 }],
        asks: [{ price: 0.43, size: 8 }]
      }
    });

    expect(snapshot).toMatchObject({
      tokenId: "token-1",
      marketSlug: "example-market",
      eventSlug: "example-event",
      marketId: "market-1",
      side: "NO",
      strategySource: "neg_risk_bracket_arb",
      expectedResolutionAt: 1_700_086_400_000,
      opportunityId: "opportunity-1",
      source: "clob_current_book",
      bestBid: 0.41,
      bestAsk: 0.43,
      capturedAt: 1_700_000_000_000
    });
    expect(snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(listRecentOrderBookSnapshots(10)).toHaveLength(1);
  });

  it("rejects snapshots without a token id", () => {
    expect(() =>
      recordOrderBookSnapshot({
        tokenId: "",
        orderbook: {
          bids: [],
          asks: []
        }
      })
    ).toThrow("tokenId is required");
  });
});
