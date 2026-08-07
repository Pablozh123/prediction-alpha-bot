import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  calculatePaperPnlOnlyIfResolutionKnown,
  resolveOpenPaperTradesBatch,
  resolvePaperTradesForMarket,
  type MarketResolution,
  type ResolutionLookup
} from "../src/execution/paperResolution.js";
import {
  listRecentPaperTrades,
  recordPaperTrade
} from "../src/execution/tradeJournal.js";

const testDbPath = join("logs", "paper-resolution-test.db");

describe("paper resolution tracking", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("keeps unresolved markets unresolved", async () => {
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      slug: "unresolved-market",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.5,
      timestamp: 1
    });
    const fetchResolution = vi.fn().mockResolvedValue({
      status: "unresolved",
      slug: "unresolved-market",
      reason: "market_not_closed"
    } satisfies MarketResolution);

    const result = await resolvePaperTradesForMarket("unresolved-market", {
      fetchResolution
    });

    expect(result).toMatchObject({
      resolutionStatus: "unresolved",
      resolvedCount: 0,
      unresolvedCount: 1,
      flaggedCount: 0,
      reason: "market_not_closed"
    });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(false);
    expect(trade?.pnl).toBeNull();
    expect(trade?.inflationFlagged).toBe(false);
  });

  it("resolves a known winning paper trade with ground truth", async () => {
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      slug: "known-win",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.5,
      timestamp: 1
    });

    const result = await resolvePaperTradesForMarket("known-win", {
      fetchResolution: async () => ({
        status: "resolved",
        slug: "known-win",
        winningSide: "YES",
        reason: "known_winning_outcome"
      }),
      now: () => 123
    });

    expect(result).toMatchObject({
      resolutionStatus: "resolved",
      resolvedCount: 1,
      unresolvedCount: 0,
      flaggedCount: 0
    });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(true);
    expect(trade?.exitPrice).toBe(1);
    expect(trade?.pnl).toBe(10);
    expect(trade?.resolvedAt).toBe(123);
    expect(trade?.resolutionReason).toBe("known_winning_outcome");
  });

  it("resolves a known losing paper trade with ground truth", async () => {
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      slug: "known-loss",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.5,
      timestamp: 1
    });

    await resolvePaperTradesForMarket("known-loss", {
      fetchResolution: async () => ({
        status: "resolved",
        slug: "known-loss",
        winningSide: "NO",
        reason: "known_winning_outcome"
      })
    });

    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(true);
    expect(trade?.exitPrice).toBe(0);
    expect(trade?.pnl).toBe(-10);
  });

  it("batch-resolves only slugs with clear ground truth", async () => {
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      slug: "known-win",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.5,
      timestamp: 1
    });
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      slug: "still-open",
      side: "YES",
      sizeUsd: 10,
      entryPrice: 0.5,
      timestamp: 2
    });
    const fetchResolution = vi.fn(
      async (lookup: ResolutionLookup): Promise<MarketResolution> => {
        const slug = typeof lookup === "string" ? lookup : lookup.slug;

        return slug === "known-win"
          ? {
              status: "resolved",
              slug: "known-win",
              winningSide: "YES",
              reason: "known_winning_outcome"
            }
          : {
              status: "unresolved",
              slug,
              reason: "market_not_closed"
            };
      }
    );

    const result = await resolveOpenPaperTradesBatch({ fetchResolution });

    expect(result).toMatchObject({
      checkedSlugs: 2,
      resolvedCount: 1,
      unresolvedCount: 1,
      flaggedCount: 0
    });
    const trades = listRecentPaperTrades(10);
    expect(trades.find((trade) => trade.slug === "known-win")?.resolved).toBe(
      true
    );
    expect(trades.find((trade) => trade.slug === "still-open")?.resolved).toBe(
      false
    );
  });

  it("batch-flags ambiguous closed markets without setting PnL", async () => {
    recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "ambiguous-batch-market",
      side: "NO",
      sizeUsd: 4,
      entryPrice: 0.4,
      timestamp: 1
    });

    const result = await resolveOpenPaperTradesBatch({
      fetchResolution: async () => ({
        status: "ambiguous",
        slug: "ambiguous-batch-market",
        reason: "closed_market_without_clear_winner"
      })
    });

    expect(result).toMatchObject({
      checkedSlugs: 1,
      resolvedCount: 0,
      unresolvedCount: 1,
      flaggedCount: 1
    });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(false);
    expect(trade?.pnl).toBeNull();
    expect(trade?.inflationFlagged).toBe(true);
  });

  it("uses size_shares when present for PnL calculation", async () => {
    recordPaperTrade({
      strategy: "within_market_yes_no_arb",
      slug: "size-shares-win",
      side: "YES",
      sizeUsd: 0.4,
      sizeShares: 1,
      entryPrice: 0.2,
      timestamp: 1
    });

    await resolvePaperTradesForMarket("size-shares-win", {
      fetchResolution: async () => ({
        status: "resolved",
        slug: "size-shares-win",
        winningSide: "YES",
        reason: "known_winning_outcome"
      })
    });

    const [trade] = listRecentPaperTrades(1);
    expect(trade?.pnl).toBe(0.6);
  });

  it("flags ambiguous resolutions without setting PnL", async () => {
    recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "ambiguous-market",
      side: "NO",
      sizeUsd: 12,
      entryPrice: 0.4,
      timestamp: 1
    });

    const result = await resolvePaperTradesForMarket("ambiguous-market", {
      fetchResolution: async () => ({
        status: "ambiguous",
        slug: "ambiguous-market",
        reason: "closed_market_without_clear_winner"
      })
    });

    expect(result).toMatchObject({
      resolutionStatus: "ambiguous",
      resolvedCount: 0,
      unresolvedCount: 1,
      flaggedCount: 1
    });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(false);
    expect(trade?.pnl).toBeNull();
    expect(trade?.inflationFlagged).toBe(true);
    expect(trade?.resolutionReason).toBe(
      "closed_market_without_clear_winner"
    );
  });

  it("refuses PnL calculation without known resolution", () => {
    expect(
      calculatePaperPnlOnlyIfResolutionKnown(
        { side: "YES", sizeUsd: 10, entryPrice: 0.5 },
        {
          status: "unresolved",
          reason: "market_not_closed"
        }
      )
    ).toEqual({
      canCalculate: false,
      reason: "market_not_closed"
    });
  });

  it("contains no live order integration", () => {
    const source = readFileSync("src/execution/paperResolution.ts", "utf8");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toContain("createAndPostOrder");
    expect(source).not.toContain("placeOrder");
    expect(source).not.toContain("postOrder");
    expect(source).not.toContain("buyLimit");
    expect(source).not.toContain("sellPosition");
  });
});
