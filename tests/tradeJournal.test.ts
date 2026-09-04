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
      "opportunity_legs",
      "orderbook_snapshots",
      "orderbook_token_blocks",
      "paper_dedupe_skips",
      "paper_fire_dedup",
      "paper_trades",
      "scan_cycles",
      "scanner_runs",
      "sports_resolution_watch",
      "sports_slug_mappings",
      "sports_ticks"
    ]);
  });

  it("migrates a database written before the 2026-09 columns existed", () => {
    // Build the pre-2026-09 shape by hand: no link_status, no opportunity_key,
    // no economics columns, no leg venue/role/fee columns.
    const legacy = initDb(testDbPath);
    legacy.exec("DROP INDEX IF EXISTS idx_opportunities_key_timestamp");
    legacy.exec("DROP TABLE opportunities");
    legacy.exec("DROP TABLE opportunity_legs");
    legacy.exec("DROP TABLE paper_trades");
    legacy.exec(`
      CREATE TABLE paper_trades (
        id TEXT PRIMARY KEY, strategy TEXT NOT NULL, slug TEXT, question TEXT,
        token_id TEXT, opportunity_id TEXT, side TEXT NOT NULL, size_usd REAL NOT NULL,
        size_shares REAL, entry_price REAL NOT NULL, exit_price REAL,
        resolved INTEGER DEFAULT 0, pnl REAL, inflation_flagged INTEGER DEFAULT 0,
        resolution_reason TEXT, arb_class TEXT, timestamp INTEGER NOT NULL, resolved_at INTEGER
      );
      CREATE TABLE opportunities (
        id TEXT PRIMARY KEY, strategy TEXT NOT NULL, slug TEXT, raw_edge REAL,
        executable_edge REAL, status TEXT NOT NULL, reason TEXT, token_ids TEXT,
        timestamp INTEGER NOT NULL
      );
      CREATE TABLE opportunity_legs (
        id TEXT PRIMARY KEY, opportunity_id TEXT NOT NULL, strategy TEXT NOT NULL,
        slug TEXT, market_id TEXT, question TEXT, token_id TEXT NOT NULL, side TEXT NOT NULL,
        raw_yes_price REAL, average_fill_price REAL, max_fillable_usd REAL, best_bid REAL,
        best_ask REAL, spread REAL, fillable INTEGER NOT NULL DEFAULT 0, reason TEXT,
        leg_index INTEGER NOT NULL, timestamp INTEGER NOT NULL
      );
      INSERT INTO paper_trades (id, strategy, side, size_usd, entry_price, timestamp)
      VALUES ('legacy-1', 'neg_risk_bracket_arb', 'NO', 1, 0.4, 1);
    `);
    closeDb();

    const db = initDb(testDbPath);
    const columns = (table: string) =>
      db
        .prepare<{ name: string }>(`PRAGMA table_info(${table})`)
        .all()
        .map((column) => column.name);

    expect(columns("paper_trades")).toContain("link_status");
    expect(columns("opportunities")).toEqual(
      expect.arrayContaining(["opportunity_key", "net_edge_bps", "annualized_pct", "rule_match"]),
    );
    expect(columns("opportunity_legs")).toEqual(
      expect.arrayContaining(["venue", "role", "fee_usd"]),
    );
    expect(listRecentPaperTrades(10)[0]).toMatchObject({ id: "legacy-1", linkStatus: null });
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
      sizeShares: 25,
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
    expect(trade.sizeShares).toBe(25);
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
