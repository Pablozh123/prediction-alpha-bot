import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, initDb } from "../src/execution/db.js";
import { recordOpportunity } from "../src/execution/opportunityJournal.js";
import {
  listRecentPaperTrades,
  recordPaperTrade,
  summarizePaperTrades,
} from "../src/execution/tradeJournal.js";
import { backfillPaperTradeLinks } from "../src/scripts/backfillPaperTradeLinks.js";

const testDbPath = join("logs", "backfill-links-test.db");
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

describe("backfillPaperTradeLinks", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("links trades to the candidate that names their token and marks the rest legacy", () => {
    const fired = recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "rate-cuts",
      tokenIds: ["no-a", "no-b"],
      status: "paper_fired",
      timestamp: NOW,
    });
    // trades written without a link, as the May 2026 code did
    const linkable = recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0.4,
      tokenId: "no-a",
      timestamp: NOW + 500,
    });
    const orphan = recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0.4,
      tokenId: "no-z",
      timestamp: NOW - 4 * 60 * 60 * 1000,
    });
    const alreadyLinked = recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0.4,
      tokenId: "no-b",
      opportunityId: fired.id,
      timestamp: NOW + 600,
    });
    // simulate a pre-link_status row that has an id but no status
    getDb().exec(`UPDATE paper_trades SET link_status = NULL WHERE id = '${alreadyLinked.id}'`);

    const result = backfillPaperTradeLinks({ windowMs: 60_000 });

    expect(result).toEqual({
      checked: 2,
      backfilled: 1,
      legacyUnlinked: 1,
      alreadyLinked: 1,
    });

    const byId = new Map(listRecentPaperTrades(10).map((trade) => [trade.id, trade]));

    expect(byId.get(linkable.id)).toMatchObject({
      opportunityId: fired.id,
      linkStatus: "backfilled",
    });
    expect(byId.get(orphan.id)).toMatchObject({
      opportunityId: null,
      linkStatus: "legacy_unlinked",
    });
    expect(byId.get(alreadyLinked.id)).toMatchObject({
      opportunityId: fired.id,
      linkStatus: "linked",
    });
    expect(summarizePaperTrades(0)).toMatchObject({
      total: 3,
      unlinked: 1,
      legacyUnlinked: 1,
    });
  });

  it("is idempotent", () => {
    recordPaperTrade({
      strategy: "within_market_fast_arb",
      side: "YES",
      sizeUsd: 1,
      entryPrice: 0.5,
      tokenId: "t",
      timestamp: NOW,
    });

    backfillPaperTradeLinks();
    const second = backfillPaperTradeLinks();

    expect(second).toEqual({ checked: 1, backfilled: 0, legacyUnlinked: 1, alreadyLinked: 0 });
  });
});
