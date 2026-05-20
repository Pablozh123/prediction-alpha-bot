import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  listRecentPaperTrades,
  recordPaperTrade
} from "../src/execution/tradeJournal.js";

const testDbPath = join("logs", "test-trades.db");

describe("trade journal", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("initializes the database", () => {
    const db = initDb(testDbPath);
    const tables = db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all()
      .map((row) => row.name);

    expect(existsSync(testDbPath)).toBe(true);
    expect(tables).toEqual([
      "live_trades",
      "opportunities",
      "paper_fire_dedup",
      "paper_trades",
      "scan_cycles"
    ]);
  });

  it("stores a paper trade", () => {
    initDb(testDbPath);

    const trade = recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "example-event",
      question: "Example question?",
      tokenId: "token-1",
      opportunityId: "opportunity-1",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.42,
      arbClass: "neg_risk_bracket_arb",
      timestamp: 1_700_000_000_000
    });

    expect(trade.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(trade.resolved).toBe(false);
    expect(trade.inflationFlagged).toBe(false);
    expect(trade.opportunityId).toBe("opportunity-1");
  });

  it("reads recent paper trades", () => {
    initDb(testDbPath);

    const first = recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.42,
      timestamp: 1_700_000_000_000
    });
    const second = recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      side: "NO",
      sizeUsd: 5,
      entryPrice: 0.58,
      timestamp: 1_700_000_001_000
    });

    expect(listRecentPaperTrades(10)).toEqual([second, first]);
  });
});
