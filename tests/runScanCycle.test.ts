import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listRecentOpportunities } from "../src/execution/opportunityJournal.js";
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
      error: vi.fn()
    };

    const result = await runScanCycle({
      logger,
      execute,
      scanner: async () => [makeOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity()
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0,
      rejectedOpportunities: 0
    });
    expect(logger.info).toHaveBeenCalledWith(
      "NEG_RISK bracket opportunities: 1"
    );
    expect(execute).toHaveBeenCalledWith({
      strategy: "neg_risk_bracket_arb",
      slug: "zero-cuts",
      question: "Zero cuts?",
      tokenId: "m1-no",
      side: "NO",
      entryPrice: 0.35,
      paperSizeUsd: 1,
      arbClass: "neg_risk_bracket_arb"
    });
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "paper_fired",
      rawEdge: 0.03,
      executableEdge: 0.25,
      reason: "paper_trade_recorded"
    });
  });

  it("logs API failures and lets the next interval continue", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const result = await runScanCycle({
      logger,
      withinMarketScanner: async () => [],
      scanner: async () => {
        throw new Error("Gamma unavailable");
      }
    });

    expect(result).toEqual({
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      error: "Gamma unavailable"
    });
    expect(logger.error).toHaveBeenCalledWith(
      "scan cycle failed: Gamma unavailable"
    );
  });

  it("skips the same opportunity inside the paper fire cooldown", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const opportunity = makeOpportunity();

    await runScanCycle({
      logger,
      now: () => 1_000,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity()
    });
    const result = await runScanCycle({
      logger,
      now: () => 2_000,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity()
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 0,
      skippedDuplicates: 1,
      rejectedOpportunities: 1
    });
    expect(listRecentPaperTrades(10)).toHaveLength(2);
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "duplicate_within_cooldown"
    });
    expect(logger.info).toHaveBeenCalledWith(
      "skipped duplicate paper opportunity."
    );
  });

  it("fires the same opportunity again after the paper fire cooldown", async () => {
    const opportunity = makeOpportunity();

    await runScanCycle({
      now: () => 1_000,
      paperFireCooldownMs: 10,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity()
    });
    const result = await runScanCycle({
      now: () => 1_011,
      paperFireCooldownMs: 10,
      scanner: async () => [opportunity],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => makeValidatedOpportunity()
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0,
      rejectedOpportunities: 0
    });
    expect(listRecentPaperTrades(10)).toHaveLength(4);
  });

  it("records rejected opportunities without writing paper trades", async () => {
    const execute = vi.fn();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const result = await runScanCycle({
      execute,
      logger,
      scanner: async () => [makeOpportunity()],
      withinMarketScanner: async () => [],
      validateOpportunity: async () => ({
        ...makeValidatedOpportunity(),
        executableSum: null,
        expectedGrossEdge: null,
        fillable: false,
        valid: false,
        reason: "partial_basket_invalid"
      })
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1
    });
    expect(execute).not.toHaveBeenCalled();
    expect(listRecentPaperTrades(10)).toEqual([]);
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      status: "rejected",
      reason: "partial_basket_invalid"
    });
  });

  it("validates and papers within-market opportunities through the shared pipeline", async () => {
    const execute = vi.fn();

    const result = await runScanCycle({
      execute,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
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
            no: "no-token"
          },
          reason: "yes_no_ask_sum_below_threshold"
        }
      ],
      validateWithinMarket: async () => ({
        slug: "binary-market",
        question: "Will this resolve yes?",
        tokenIds: {
          yes: "yes-token",
          no: "no-token"
        },
        askYes: 0.45,
        askNo: 0.52,
        totalCost: 0.97,
        expectedGrossEdge: 0.03,
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
          reason: "fillable"
        },
        no: {
          tokenId: "no-token",
          fillable: true,
          averageFillPrice: 0.52,
          maxFillableUsd: 100,
          bestBid: 0.51,
          bestAsk: 0.52,
          reason: "fillable"
        }
      })
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0,
      rejectedOpportunities: 0
    });
    expect(execute).toHaveBeenNthCalledWith(1, {
      strategy: "within_market_yes_no_arb",
      slug: "binary-market",
      question: "Will this resolve yes?",
      tokenId: "yes-token",
      side: "YES",
      entryPrice: 0.45,
      paperSizeUsd: 1,
      arbClass: "within_market_yes_no_arb"
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      strategy: "within_market_yes_no_arb",
      slug: "binary-market",
      question: "Will this resolve yes?",
      tokenId: "no-token",
      side: "NO",
      entryPrice: 0.52,
      paperSizeUsd: 1,
      arbClass: "within_market_yes_no_arb"
    });
    expect(listRecentOpportunities(10)[0]).toMatchObject({
      strategy: "within_market_yes_no_arb",
      status: "paper_fired",
      executableEdge: 0.03
    });
  });
});

function makeOpportunity(): NegRiskBracketOpportunity {
  return {
    eventSlug: "rate-cuts-2026",
    sumYes: 1.06,
    threshold: 1.03,
    expectedEdge: 0.03,
    reason: "needs_orderbook_depth_check",
    legs: [
      {
        marketId: "m1",
        slug: "zero-cuts",
        question: "Zero cuts?",
        yesTokenId: "m1-yes",
        noTokenId: "m1-no",
        yesPrice: 0.4,
        sideToPaperTrade: "NO"
      },
      {
        marketId: "m2",
        slug: "one-cut",
        question: "One cut?",
        yesTokenId: "m2-yes",
        noTokenId: "m2-no",
        yesPrice: 0.35,
        sideToPaperTrade: "NO"
      }
    ]
  };
}

function makeValidatedOpportunity(): ValidatedNegRiskOpportunity {
  return {
    eventSlug: "rate-cuts-2026",
    threshold: 1.03,
    executableSum: 0.75,
    expectedGrossEdge: 0.25,
    fillable: true,
    valid: true,
    reason: "orderbook_validated",
    legs: [
      {
        marketId: "m1",
        slug: "zero-cuts",
        question: "Zero cuts?",
        tokenId: "m1-no",
        sideToPaperTrade: "NO",
        averageFillPrice: 0.35,
        maxFillableUsd: 100,
        bestBid: 0.33,
        bestAsk: 0.35,
        fillable: true,
        reason: "fillable"
      },
      {
        marketId: "m2",
        slug: "one-cut",
        question: "One cut?",
        tokenId: "m2-no",
        sideToPaperTrade: "NO",
        averageFillPrice: 0.4,
        maxFillableUsd: 100,
        bestBid: 0.38,
        bestAsk: 0.4,
        fillable: true,
        reason: "fillable"
      }
    ]
  };
}
