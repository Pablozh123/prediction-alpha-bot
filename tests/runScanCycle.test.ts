import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listRecentOpportunities } from "../src/execution/opportunityJournal.js";
import { listOpportunityLegs } from "../src/execution/opportunityLegJournal.js";
import { listRecentOrderBookSnapshots } from "../src/execution/orderbookSnapshotJournal.js";
import { listRecentPaperDedupeSkips } from "../src/execution/paperDedupe.js";
import { listRecentPaperTrades } from "../src/execution/tradeJournal.js";
import { runScanCycle } from "../src/scanner/runScanCycle.js";
import type { NegRiskBracketOpportunity } from "../src/scanner/negRiskBracketScanner.js";
import type { ValidatedNegRiskOpportunity } from "../src/scanner/opportunityValidator.js";

const testDbPath = join("logs", "run-scan-cycle-test.db");

describe("runScanCycle", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("logs opportunity count and writes paper trades for every leg", async () => {
    const execute = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await runScanCycle({
      logger,
      execute,
      scanner: async () => [makeOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "NEG_RISK bracket opportunities: 1",
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: "neg_risk_bracket_arb",
        slug: "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
        question: "Will the Cleveland Cavaliers win the 2026 NBA Finals?",
        tokenId: "m1-no",
        side: "NO",
        entryPrice: 0.35,
        paperSizeUsd: 0.35,
        paperSizeShares: 1,
        arbClass: "neg_risk_bracket_arb",
      }),
    );
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "paper_fired",
      rawEdge: 0.03,
      executableEdge: 0.25,
      fillableUsd: 200,
      minLegDepthUsd: 100,
      legCount: 2,
      executableSum: 0.75,
      feeAdjustedEdge: 0.25,
      basketSizeShares: 1,
      basketCostUsd: 0.75,
      basketPayoutUsd: 1,
      basketProfitUsd: 0.25,
      edgeBps: 2500,
      roiBps: 3333.33,
      maxPositiveBasketShares: 10,
      maxPositiveBasketCostUsd: 150,
      reason: "paper_trade_recorded",
    });
    expect(
      listOpportunityLegs(listRecentOpportunities(10)[0]?.id ?? ""),
    ).toHaveLength(2);
    expect(listRecentOrderBookSnapshots(10)).toHaveLength(2);
  });

  it("logs API failures and lets the next interval continue", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await runScanCycle({
      logger,
      withinMarketScanner: async () => [],
      scanner: async () => {
        throw new Error("Gamma unavailable");
      },
    });

    expect(result).toEqual({
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      error: "Gamma unavailable",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('"event":"scan_cycle_failed"'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Gamma unavailable"),
    );
  });

  it("sends an optional alert only after a validated paper fire", async () => {
    const sendAlert = vi.fn().mockResolvedValue(undefined);

    await runScanCycle({
      sendAlert,
      scanner: async () => [makeOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });

    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining("Paper opportunity fired"),
    );
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining("strategy: neg_risk_bracket_arb"),
    );
  });

  it("skips the same opportunity inside the paper fire cooldown", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const opportunity = makeOpportunity();

    await runScanCycle({
      logger,
      now: () => 1_000,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });
    const result = await runScanCycle({
      logger,
      now: () => 2_000,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 0,
      skippedDuplicates: 1,
      rejectedOpportunities: 0,
    });
    expect(listRecentPaperTrades(10)).toHaveLength(2);
    expect(listRecentPaperTrades(10)[0]).toMatchObject({
      sizeShares: 1,
      sizeUsd: 0.4,
    });
    expect(listRecentOpportunities(10)).toHaveLength(1);
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "paper_fired",
      reason: "paper_trade_recorded",
    });
    expect(listRecentPaperDedupeSkips(10)[0]).toMatchObject({
      strategy: "neg_risk_bracket_arb",
      slug: "2026-nba-champion",
      threshold: 1.03,
      tokenIds: ["m1-no", "m2-no"],
      previousFireAt: 1_000,
      skippedAt: 2_000,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "skipped duplicate paper opportunity.",
    );
  });

  it("fires the same opportunity again after the paper fire cooldown", async () => {
    const opportunity = makeOpportunity();

    await runScanCycle({
      now: () => 1_000,
      paperFireCooldownMs: 10,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });
    const result = await runScanCycle({
      now: () => 1_011,
      paperFireCooldownMs: 10,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
    });
    expect(listRecentPaperTrades(10)).toHaveLength(4);
  });

  it("records rejected opportunities without writing paper trades", async () => {
    const execute = vi.fn();
    const sendAlert = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await runScanCycle({
      execute,
      logger,
      sendAlert,
      scanner: async () => [makeOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => ({
        ...makeValidatedOpportunity(),
        executableSum: null,
        expectedGrossEdge: null,
        fillable: false,
        valid: false,
        reason: "partial_basket_invalid",
      }),
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
    expect(listRecentPaperTrades(10)).toEqual([]);
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "partial_basket_invalid",
    });
  });

  it("rejects positive NEG_RISK baskets that are not clean one-winner arbs", async () => {
    const execute = vi.fn();

    const result = await runScanCycle({
      execute,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      scanner: async () => [makeTemporalOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(listRecentPaperTrades(10)).toEqual([]);
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "nested_temporal_basket",
    });
  });

  it("does not allow disabled clean basket filtering to bypass structural safety", async () => {
    const execute = vi.fn();

    const result = await runScanCycle({
      cleanBasketFilterOptions: { enabled: false },
      execute,
      scanner: async () => [makeTemporalOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity(),
    });

    expect(result).toMatchObject({
      success: true,
      paperTrades: 0,
      rejectedOpportunities: 1,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "nested_temporal_basket",
    });
  });

  it("validates and papers within-market opportunities through the shared pipeline", async () => {
    const execute = vi.fn();

    const result = await runScanCycle({
      execute,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      scanner: async () => [],
      withinMarketScanner: async () => [
        {
          slug: "binary-market",
          question: "Will this resolve yes?",
          askYes: 0.45,
          askNo: 0.52,
          totalCost: 0.97,
          expectedEdge: 0.03,
          tokenIds: {
            yes: "yes-token",
            no: "no-token",
          },
          expectedResolutionAt: Date.now() + 60 * 60 * 1000,
          reason: "yes_no_ask_sum_below_threshold",
        },
      ],
      validateWithinMarket: async () => ({
        slug: "binary-market",
        question: "Will this resolve yes?",
        tokenIds: {
          yes: "yes-token",
          no: "no-token",
        },
        askYes: 0.45,
        askNo: 0.52,
        totalCost: 0.97,
        expectedGrossEdge: 0.03,
        fillableUsd: 200,
        minLegDepthUsd: 100,
        legCount: 2,
        executableSum: 0.97,
        feeAdjustedEdge: 0.03,
        fillable: true,
        valid: true,
        reason: "orderbook_validated",
        yes: {
          tokenId: "yes-token",
          fillable: true,
          averageFillPrice: 0.45,
          maxFillableUsd: 100,
          bestBid: 0.44,
          bestAsk: 0.45,
          reason: "fillable",
          orderbook: {
            bids: [{ price: 0.44, size: 10 }],
            asks: [{ price: 0.45, size: 10 }],
          },
        },
        no: {
          tokenId: "no-token",
          fillable: true,
          averageFillPrice: 0.52,
          maxFillableUsd: 100,
          bestBid: 0.51,
          bestAsk: 0.52,
          reason: "fillable",
          orderbook: {
            bids: [{ price: 0.51, size: 10 }],
            asks: [{ price: 0.52, size: 10 }],
          },
        },
      }),
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
    });
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        strategy: "within_market_fast_arb",
        slug: "binary-market",
        question: "Will this resolve yes?",
        tokenId: "yes-token",
        side: "YES",
        entryPrice: 0.45,
        paperSizeUsd: 0.45,
        paperSizeShares: 1,
        arbClass: "within_market_fast_arb",
      }),
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        strategy: "within_market_fast_arb",
        slug: "binary-market",
        question: "Will this resolve yes?",
        tokenId: "no-token",
        side: "NO",
        entryPrice: 0.52,
        paperSizeUsd: 0.52,
        paperSizeShares: 1,
        arbClass: "within_market_fast_arb",
      }),
    );
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      strategy: "within_market_fast_arb",
      status: "paper_fired",
      executableEdge: 0.03,
      fillableUsd: 200,
      minLegDepthUsd: 100,
      legCount: 2,
      executableSum: 0.97,
      feeAdjustedEdge: 0.03,
    });
  });

  it("keeps within-market candidates with unknown duration diagnostic-only", async () => {
    const result = await runScanCycle({
      execute: vi.fn(),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      scanner: async () => [],
      withinMarketScanner: async () => [
        {
          slug: "binary-market",
          question: "Will this resolve yes?",
          askYes: 0.45,
          askNo: 0.52,
          totalCost: 0.97,
          expectedEdge: 0.03,
          tokenIds: {
            yes: "yes-token",
            no: "no-token",
          },
          reason: "yes_no_ask_sum_below_threshold",
        },
      ],
      validateWithinMarket: async () => ({
        slug: "binary-market",
        question: "Will this resolve yes?",
        tokenIds: {
          yes: "yes-token",
          no: "no-token",
        },
        askYes: 0.45,
        askNo: 0.52,
        totalCost: 0.97,
        expectedGrossEdge: 0.03,
        fillableUsd: 200,
        minLegDepthUsd: 100,
        legCount: 2,
        executableSum: 0.97,
        feeAdjustedEdge: 0.03,
        fillable: true,
        valid: true,
        reason: "orderbook_validated",
        yes: {
          tokenId: "yes-token",
          fillable: true,
          averageFillPrice: 0.45,
          maxFillableUsd: 100,
          bestBid: 0.44,
          bestAsk: 0.45,
          reason: "fillable",
        },
        no: {
          tokenId: "no-token",
          fillable: true,
          averageFillPrice: 0.52,
          maxFillableUsd: 100,
          bestBid: 0.51,
          bestAsk: 0.52,
          reason: "fillable",
        },
      }),
    });

    expect(result).toMatchObject({
      paperTrades: 0,
      rejectedOpportunities: 1,
      success: true,
    });
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "unknown_duration_for_short_arb",
    });
  });

  it("uses a wider within-market watch threshold before validation", async () => {
    const withinMarketScanner = vi.fn(async () => []);

    await runScanCycle({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      scanner: async () => [],
      withinMarketScanner,
    });

    expect(withinMarketScanner).toHaveBeenCalledWith({ threshold: 1.01 });
  });
});

function makeOpportunity(): NegRiskBracketOpportunity {
  return {
    eventSlug: "2026-nba-champion",
    sumYes: 1.06,
    threshold: 1.03,
    expectedEdge: 0.03,
    expectedResolutionAt: 60 * 60 * 1000,
    reason: "needs_orderbook_depth_check",
    legs: [
      {
        marketId: "m1",
        slug: "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
        question: "Will the Cleveland Cavaliers win the 2026 NBA Finals?",
        yesTokenId: "m1-yes",
        noTokenId: "m1-no",
        yesPrice: 0.4,
        sideToPaperTrade: "NO",
      },
      {
        marketId: "m2",
        slug: "will-the-new-york-knicks-win-the-2026-nba-finals",
        question: "Will the New York Knicks win the 2026 NBA Finals?",
        yesTokenId: "m2-yes",
        noTokenId: "m2-no",
        yesPrice: 0.35,
        sideToPaperTrade: "NO",
      },
    ],
  };
}

function makeTemporalOpportunity(): NegRiskBracketOpportunity {
  return {
    ...makeOpportunity(),
    eventSlug: "will-russia-capture-kostyantynivka-by",
    legs: makeOpportunity().legs.map((leg, index) => ({
      ...leg,
      slug:
        index === 0
          ? "will-russia-capture-kostyantynivka-by-may-31"
          : "will-russia-capture-kostyantynivka-by-june-30",
      question:
        index === 0
          ? "Will Russia capture Kostyantynivka by May 31?"
          : "Will Russia capture Kostyantynivka by June 30?",
    })),
  };
}

function makeValidatedOpportunity(): ValidatedNegRiskOpportunity {
  return {
    eventSlug: "2026-nba-champion",
    threshold: 1.03,
    executableSum: 0.75,
    expectedGrossEdge: 0.25,
    fillableUsd: 200,
    minLegDepthUsd: 100,
    legCount: 2,
    feeAdjustedEdge: 0.25,
    fillable: true,
    valid: true,
    reason: "orderbook_validated",
    legs: [
      {
        marketId: "m1",
        slug: "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
        question: "Will the Cleveland Cavaliers win the 2026 NBA Finals?",
        tokenId: "m1-no",
        sideToPaperTrade: "NO",
        averageFillPrice: 0.35,
        maxFillableUsd: 100,
        bestBid: 0.33,
        bestAsk: 0.35,
        fillable: true,
        reason: "fillable",
        orderbook: {
          bids: [{ price: 0.33, size: 10 }],
          asks: [{ price: 0.35, size: 10 }],
        },
      },
      {
        marketId: "m2",
        slug: "will-the-new-york-knicks-win-the-2026-nba-finals",
        question: "Will the New York Knicks win the 2026 NBA Finals?",
        tokenId: "m2-no",
        sideToPaperTrade: "NO",
        averageFillPrice: 0.4,
        maxFillableUsd: 100,
        bestBid: 0.38,
        bestAsk: 0.4,
        fillable: true,
        reason: "fillable",
        orderbook: {
          bids: [{ price: 0.38, size: 10 }],
          asks: [{ price: 0.4, size: 10 }],
        },
      },
    ],
    basketSizing: {
      basketSizeShares: 1,
      basketCostUsd: 0.75,
      basketPayoutUsd: 1,
      basketProfitUsd: 0.25,
      edgePerShare: 0.25,
      edgeBps: 2500,
      roiBps: 3333.33,
      maxPositiveBasketShares: 10,
      maxPositiveBasketCostUsd: 150,
      maxPositiveBasketPayoutUsd: 10,
      maxPositiveBasketProfitUsd: 2.5,
      legs: [
        {
          tokenId: "m1-no",
          slug: "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
          shares: 1,
          averageFillPrice: 0.35,
          costUsd: 0.35,
        },
        {
          tokenId: "m2-no",
          slug: "will-the-new-york-knicks-win-the-2026-nba-finals",
          shares: 1,
          averageFillPrice: 0.4,
          costUsd: 0.4,
        },
      ],
    },
  };
}
