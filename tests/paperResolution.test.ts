import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import {
  calculatePaperPnlOnlyIfResolutionKnown,
  fetchMarketResolution,
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

  it("asks Gamma for closed markets and reads an empty answer as still open", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({ data: [] });

    const resolution = await fetchMarketResolution("settled-slug");

    expect(get).toHaveBeenCalledWith(
      "https://gamma-api.polymarket.com/markets",
      expect.objectContaining({ params: { slug: "settled-slug", closed: true } })
    );
    expect(resolution).toMatchObject({
      status: "unresolved",
      reason: "not_found_among_closed_markets"
    });
    get.mockRestore();
  });

  it("reads Gamma's settled market shape: string arrays and a space-separated closedTime", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        {
          slug: "microstrategy-sell-any-bitcoin-in-2025",
          closed: true,
          umaResolutionStatus: "resolved",
          closedTime: "2026-01-05 04:22:25+00",
          outcomes: '["Yes", "No"]',
          outcomePrices: '["0", "1"]'
        }
      ]
    });

    const resolution = await fetchMarketResolution(
      "microstrategy-sell-any-bitcoin-in-2025"
    );

    expect(resolution).toMatchObject({
      status: "resolved",
      winningSide: "NO",
      resolvedAt: Date.parse("2026-01-05T04:22:25Z"),
      reason: "final_outcome_prices"
    });
    get.mockRestore();
  });

  it("pays half a dollar a share on a split settlement", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: [
        {
          slug: "split-market",
          closed: true,
          umaResolutionStatus: "resolved",
          closedTime: "2026-08-01T00:00:00Z",
          outcomes: '["Yes", "No"]',
          outcomePrices: '["0.5", "0.5"]'
        }
      ]
    });
    recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "split-market",
      side: "NO",
      sizeUsd: 4,
      sizeShares: 8,
      entryPrice: 0.5,
      timestamp: Date.parse("2026-07-01T00:00:00Z")
    });

    const result = await resolvePaperTradesForMarket("split-market");

    expect(result).toMatchObject({
      resolutionStatus: "resolved",
      resolvedCount: 1,
      closedWithoutFigureCount: 0,
      reason: "split_settlement"
    });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.exitPrice).toBe(0.5);
    expect(trade?.pnl).toBe(0);
    get.mockRestore();
  });

  it("closes a fill stamped after the market's close with a reason and no figure", async () => {
    recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "closed-before-fill",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0.02,
      timestamp: 2_000
    });

    const result = await resolvePaperTradesForMarket("closed-before-fill", {
      fetchResolution: async () => ({
        status: "resolved",
        slug: "closed-before-fill",
        winningSide: "NO",
        resolvedAt: 1_000,
        reason: "final_outcome_prices"
      })
    });

    expect(result).toMatchObject({
      resolvedCount: 0,
      unresolvedCount: 0,
      flaggedCount: 1,
      closedWithoutFigureCount: 1
    });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(true);
    expect(trade?.pnl).toBeNull();
    expect(trade?.exitPrice).toBeNull();
    expect(trade?.inflationFlagged).toBe(true);
    expect(trade?.resolutionReason).toBe("filled_after_close");
    expect(trade?.resolvedAt).toBe(1_000);
    // It has left the queue: the next batch has nothing to ask.
    const batch = await resolveOpenPaperTradesBatch({
      fetchResolution: async () => {
        throw new Error("must not be asked");
      }
    });
    expect(batch.checkedSlugs).toBe(0);
  });

  it("closes a settled trade whose entry cannot carry a share count, with the reason", async () => {
    recordPaperTrade({
      strategy: "neg_risk_bracket_arb",
      slug: "zero-entry",
      side: "NO",
      sizeUsd: 1,
      entryPrice: 0,
      timestamp: 1
    });

    const result = await resolvePaperTradesForMarket("zero-entry", {
      fetchResolution: async () => ({
        status: "resolved",
        slug: "zero-entry",
        winningSide: "NO",
        resolvedAt: 5,
        reason: "final_outcome_prices"
      })
    });

    expect(result).toMatchObject({ resolvedCount: 0, closedWithoutFigureCount: 1 });
    const [trade] = listRecentPaperTrades(1);
    expect(trade?.resolved).toBe(true);
    expect(trade?.pnl).toBeNull();
    expect(trade?.resolutionReason).toBe("invalid_entry_price");
  });

  it("rotates the batch through the least recently checked slugs", async () => {
    for (const [slug, timestamp] of [
      ["a", 1],
      ["b", 2],
      ["c", 3]
    ] as const) {
      recordPaperTrade({
        strategy: "within_market_yes_no_arb",
        slug,
        side: "YES",
        sizeUsd: 1,
        entryPrice: 0.5,
        timestamp
      });
    }
    const asked: string[] = [];
    const fetchResolution = async (
      lookup: ResolutionLookup
    ): Promise<MarketResolution> => {
      const slug = typeof lookup === "string" ? lookup : (lookup.slug ?? "");

      asked.push(slug);

      return { status: "unresolved", slug, reason: "not_found_among_closed_markets" };
    };

    await resolveOpenPaperTradesBatch({ fetchResolution, limit: 2, now: () => 100 });
    await resolveOpenPaperTradesBatch({ fetchResolution, limit: 2, now: () => 200 });

    // First pass: the two oldest fills. Second pass: the slug never asked,
    // then the oldest of the two already asked.
    expect(asked).toEqual(["a", "b", "c", "a"]);
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
