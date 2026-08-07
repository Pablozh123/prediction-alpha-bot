import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listActiveOrderBookTokenBlocks } from "../src/execution/orderbookTokenBlocklist.js";
import { recordOpportunity } from "../src/execution/opportunityJournal.js";
import { listRecentOrderBookSnapshots } from "../src/execution/orderbookSnapshotJournal.js";
import {
  collectSnapshotTokens,
  runOrderBookSnapshotCycle
} from "../src/scanner/orderbookSnapshotCycle.js";

const testDbPath = join("logs", "orderbook-snapshot-cycle-test.db");

describe("orderbook snapshot cycle", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("records snapshots for recent opportunity tokens", async () => {
    recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "event",
      tokenIds: ["token-1", "token-2"],
      timestamp: 1_700_000_000_000
    });

    const result = await runOrderBookSnapshotCycle({
      fetchBook: async (tokenId) => ({
        tokenId,
        bids: [{ price: 0.41, size: 10 }],
        asks: [{ price: 0.43, size: 10 }]
      }),
      fetchEvents: async () => [],
      tokenLimit: 2
    });

    expect(result).toEqual({
      success: true,
      candidateTokens: 2,
      snapshotsRecorded: 2,
      errors: 0,
      blockedFailures: 0,
      blockedTokensSkipped: 0
    });
    expect(listRecentOrderBookSnapshots(10)).toHaveLength(2);
  });

  it("falls back to Gamma active market tokens when local tokens are missing", async () => {
    const tokens = await collectSnapshotTokens({
      fetchEvents: async () => [
        {
          markets: [
            {
              slug: "market",
              clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.4", "0.6"])
            }
          ]
        }
      ],
      fetchNegRiskEvents: async () => [],
      tokenLimit: 2
    });

    expect(tokens).toEqual([
      expect.objectContaining({
        tokenId: "yes-token",
        marketSlug: "market",
        side: "YES"
      }),
      expect.objectContaining({
        tokenId: "no-token",
        marketSlug: "market",
        side: "NO"
      })
    ]);
  });

  it("merges Gamma timing metadata into duplicate recent opportunity tokens", async () => {
    recordOpportunity({
      strategy: "within_market_fast_arb",
      slug: "market-by-june-30-2026",
      tokenIds: ["yes-token"],
      timestamp: 1_700_000_000_000
    });

    const tokens = await collectSnapshotTokens({
      fetchEvents: async () => [
        {
          markets: [
            {
              id: "market-1",
              slug: "market-by-june-30-2026",
              clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.4", "0.6"])
            }
          ]
        }
      ],
      fetchNegRiskEvents: async () => [],
      tokenLimit: 2
    });

    expect(tokens.find((token) => token.tokenId === "yes-token")).toMatchObject({
      expectedResolutionAt: Date.UTC(2026, 5, 30, 23, 59, 59),
      marketId: "market-1",
      side: "YES"
    });
  });

  it("mixes recent, NEG_RISK, and within-market watch tokens across markets", async () => {
    recordOpportunity({
      strategy: "neg_risk_bracket_arb",
      slug: "local-event",
      tokenIds: ["local-1", "local-2", "local-3", "local-4"],
      timestamp: 1_700_000_000_000
    });

    const tokens = await collectSnapshotTokens({
      fetchEvents: async () => [
        {
          markets: [
            {
              slug: "within-market",
              clobTokenIds: JSON.stringify(["within-yes", "within-no"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.48", "0.5"])
            },
            {
              slug: "fallback-market",
              clobTokenIds: JSON.stringify(["fallback-yes", "fallback-no"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.4", "0.6"])
            }
          ]
        }
      ],
      fetchNegRiskEvents: async () => [
        {
          slug: "neg-risk-event",
          markets: [
            {
              id: "m1",
              slug: "neg-risk-one",
              question: "One?",
              clobTokenIds: JSON.stringify(["yes-1", "no-1"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.4", "0.6"])
            },
            {
              id: "m2",
              slug: "neg-risk-two",
              question: "Two?",
              clobTokenIds: JSON.stringify(["yes-2", "no-2"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.35", "0.65"])
            },
            {
              id: "m3",
              slug: "neg-risk-three",
              question: "Three?",
              clobTokenIds: JSON.stringify(["yes-3", "no-3"]),
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.3", "0.7"])
            }
          ]
        }
      ],
      maxTokensPerMarket: 2,
      tokenLimit: 8
    });

    expect(tokens.map((token) => token.marketSlug)).toContain("local-event");
    expect(tokens.map((token) => token.marketSlug)).toContain("neg-risk-one");
    expect(tokens.map((token) => token.marketSlug)).toContain("within-market");
    expect(new Set(tokens.map((token) => token.marketSlug)).size).toBeGreaterThan(
      2
    );
  });

  it("blocks missing orderbook tokens and skips them in later cycles", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const fetchBook = vi.fn(async () => {
      throw new Error("Request failed with status code 404");
    });

    const firstResult = await runOrderBookSnapshotCycle({
      fetchBook,
      logger,
      tokens: [{ tokenId: "missing-token", marketSlug: "market" }],
      tokenLimit: 1
    });
    const secondResult = await runOrderBookSnapshotCycle({
      fetchBook,
      logger,
      tokens: [{ tokenId: "missing-token", marketSlug: "market" }],
      tokenLimit: 1
    });

    expect(firstResult).toEqual({
      success: true,
      candidateTokens: 1,
      snapshotsRecorded: 0,
      errors: 0,
      blockedFailures: 1,
      blockedTokensSkipped: 0
    });
    expect(secondResult).toEqual({
      success: true,
      candidateTokens: 0,
      snapshotsRecorded: 0,
      errors: 0,
      blockedFailures: 0,
      blockedTokensSkipped: 1
    });
    expect(fetchBook).toHaveBeenCalledTimes(1);
    expect(listActiveOrderBookTokenBlocks(10)).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("orderbook token blocked for 24h")
    );
  });

  it("logs fetch failures without crashing the cycle", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const result = await runOrderBookSnapshotCycle({
      fetchBook: async () => {
        throw new Error("book unavailable");
      },
      logger,
      tokens: [{ tokenId: "token-1" }],
      tokenLimit: 1
    });

    expect(result).toEqual({
      success: false,
      candidateTokens: 1,
      snapshotsRecorded: 0,
      errors: 1,
      blockedFailures: 0,
      blockedTokensSkipped: 0
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("book unavailable")
    );
  });
});
