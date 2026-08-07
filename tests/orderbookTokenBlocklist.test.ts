import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  countActiveOrderBookTokenBlocks,
  filterBlockedOrderBookTokens,
  getOrderBookTokenBlock,
  listActiveOrderBookTokenBlocks,
  recordOrderBookTokenBlock
} from "../src/execution/orderbookTokenBlocklist.js";

const testDbPath = join("logs", "orderbook-token-blocklist-test.db");

describe("orderbook token blocklist", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("records and filters active orderbook token blocks", () => {
    recordOrderBookTokenBlock({
      tokenId: "missing-token",
      marketSlug: "market",
      reason: "orderbook_not_found",
      failedAt: 1_000,
      blockMs: 1_000
    });

    expect(getOrderBookTokenBlock("missing-token")).toMatchObject({
      tokenId: "missing-token",
      marketSlug: "market",
      reason: "orderbook_not_found",
      failureCount: 1,
      skipUntil: 2_000
    });
    expect(countActiveOrderBookTokenBlocks(1_500)).toBe(1);
    expect(countActiveOrderBookTokenBlocks(2_001)).toBe(0);
    expect(
      filterBlockedOrderBookTokens(
        [
          { tokenId: "missing-token", marketSlug: "market" },
          { tokenId: "healthy-token", marketSlug: "market" }
        ],
        1_500
      )
    ).toEqual({
      available: [{ tokenId: "healthy-token", marketSlug: "market" }],
      blocked: [{ tokenId: "missing-token", marketSlug: "market" }]
    });
  });

  it("increments failure counts when a token is blocked repeatedly", () => {
    recordOrderBookTokenBlock({
      tokenId: "missing-token",
      reason: "orderbook_not_found",
      failedAt: 1_000,
      blockMs: 1_000
    });
    recordOrderBookTokenBlock({
      tokenId: "missing-token",
      reason: "invalid_orderbook_token",
      failedAt: 2_000,
      blockMs: 1_000
    });

    expect(listActiveOrderBookTokenBlocks(10, 2_500)[0]).toMatchObject({
      tokenId: "missing-token",
      reason: "invalid_orderbook_token",
      failureCount: 2,
      firstFailedAt: 1_000,
      lastFailedAt: 2_000,
      skipUntil: 3_000
    });
  });
});
