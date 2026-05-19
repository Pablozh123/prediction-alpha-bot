import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listRecentPaperTrades } from "../src/execution/tradeJournal.js";
import { runScanCycle } from "../src/scanner/runScanCycle.js";
import type { NegRiskBracketOpportunity } from "../src/scanner/negRiskBracketScanner.js";

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
      scanner: async () => [makeOpportunity()]
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0
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
      entryPrice: 0.4,
      paperSizeUsd: 1,
      arbClass: "neg_risk_bracket_arb"
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
      scanner: async () => {
        throw new Error("Gamma unavailable");
      }
    });

    expect(result).toEqual({
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
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
      scanner: async () => [opportunity]
    });
    const result = await runScanCycle({
      logger,
      now: () => 2_000,
      scanner: async () => [opportunity]
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 0,
      skippedDuplicates: 1
    });
    expect(listRecentPaperTrades(10)).toHaveLength(2);
    expect(logger.info).toHaveBeenCalledWith(
      "skipped duplicate paper opportunity."
    );
  });

  it("fires the same opportunity again after the paper fire cooldown", async () => {
    const opportunity = makeOpportunity();

    await runScanCycle({
      now: () => 1_000,
      paperFireCooldownMs: 10,
      scanner: async () => [opportunity]
    });
    const result = await runScanCycle({
      now: () => 1_011,
      paperFireCooldownMs: 10,
      scanner: async () => [opportunity]
    });

    expect(result).toEqual({
      success: true,
      opportunities: 1,
      paperTrades: 2,
      skippedDuplicates: 0
    });
    expect(listRecentPaperTrades(10)).toHaveLength(4);
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
