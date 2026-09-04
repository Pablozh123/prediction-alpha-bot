import { describe, expect, it, vi } from "vitest";
import {
  validateNegRiskOpportunity,
  validateWithinMarketOpportunity,
} from "../src/scanner/opportunityValidator.js";
import type { NegRiskBracketOpportunity } from "../src/scanner/negRiskBracketScanner.js";
import type { WithinMarketArbOpportunity } from "../src/scanner/withinMarketArbScanner.js";
import type { OrderBook } from "../src/utils/orderbook.js";

describe("validateWithinMarketOpportunity", () => {
  it("uses real asks to calculate within-market total cost and gross edge", async () => {
    const result = await validateWithinMarketOpportunity(
      makeWithinMarketOpportunity(),
      10,
      {
        fetchOrderBook: async (tokenId) => {
          if (tokenId === "yes-token") {
            return makeOrderBook(0.45, 100);
          }

          return makeOrderBook(0.52, 100);
        },
      },
    );

    expect(result).toMatchObject({
      valid: true,
      fillable: true,
      reason: "orderbook_validated",
      askYes: 0.45,
      askNo: 0.52,
      totalCost: 0.97,
      expectedGrossEdge: 0.03,
    });
  });

  it("sizes the basket at the target and reprices both legs at that size", async () => {
    const result = await validateWithinMarketOpportunity(
      makeWithinMarketOpportunity(),
      10,
      {
        fetchOrderBook: async (tokenId) => {
          if (tokenId === "yes-token") {
            return {
              bids: [{ price: 0.43, size: 100 }],
              asks: [
                { price: 0.45, size: 5 },
                { price: 0.47, size: 100 },
              ],
            };
          }

          return makeOrderBook(0.52, 100);
        },
      },
    );

    // 10 USD at the quoted 0.50 + 0.50 buys 10 shares; the YES ladder walks
    // 5 at 0.45 and 5 at 0.47, so the executable YES price is 0.46, not 0.45.
    expect(result.targetShares).toBe(10);
    expect(result.executableShares).toBe(10);
    expect(result.depthLimited).toBe(false);
    expect(result.askYes).toBe(0.46);
    expect(result.totalCost).toBe(0.98);
    expect(result.expectedGrossEdge).toBe(0.02);
    expect(result.fillableUsd).toBe(9.8);
  });

  it("prices a shallow book at its depth and flags the basket depth-limited", async () => {
    const result = await validateWithinMarketOpportunity(
      makeWithinMarketOpportunity(),
      10,
      {
        fetchOrderBook: async (tokenId) => {
          if (tokenId === "yes-token") {
            return makeOrderBook(0.45, 100);
          }

          return makeOrderBook(0.52, 0.5);
        },
      },
    );

    expect(result.valid).toBe(true);
    expect(result.fillable).toBe(true);
    expect(result.depthLimited).toBe(true);
    expect(result.executableShares).toBe(0.5);
    expect(result.fillableUsd).toBe(0.485);
    expect(result.yes.fillable).toBe(true);
    expect(result.no.fillable).toBe(true);
  });

  it("rejects the basket when one leg has no asks at all", async () => {
    const result = await validateWithinMarketOpportunity(
      makeWithinMarketOpportunity(),
      10,
      {
        fetchOrderBook: async (tokenId) => {
          if (tokenId === "yes-token") {
            return makeOrderBook(0.45, 100);
          }

          return { bids: [{ price: 0.5, size: 10 }], asks: [] };
        },
      },
    );

    expect(result.valid).toBe(false);
    expect(result.fillable).toBe(false);
    expect(result.reason).toBe("partial_basket_invalid");
    expect(result.executableShares).toBe(0);
    expect(result.yes.fillable).toBe(false);
    expect(result.no.fillable).toBe(false);
  });
});

describe("validateNegRiskOpportunity", () => {
  it("validates every NO leg and calculates executable sum", async () => {
    const result = await validateNegRiskOpportunity(
      makeNegRiskOpportunity(),
      5,
      {
        fetchOrderBook: async (tokenId) => {
          if (tokenId === "m1-no") {
            return makeOrderBook(0.58, 100);
          }

          if (tokenId === "m2-no") {
            return makeOrderBook(0.61, 100);
          }

          return makeOrderBook(0.63, 100);
        },
      },
    );

    expect(result).toMatchObject({
      valid: true,
      fillable: true,
      reason: "orderbook_validated",
      executableSum: 1.82,
      expectedGrossEdge: 0.18,
    });
  });

  it("rejects a partial NEG_RISK basket when any leg is not fillable", async () => {
    const result = await validateNegRiskOpportunity(
      makeNegRiskOpportunity(),
      5,
      {
        fetchOrderBook: async (tokenId) => {
          if (tokenId === "m2-no") {
            return makeOrderBook(0.61, 0.5);
          }

          return makeOrderBook(0.6, 100);
        },
      },
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("partial_basket_invalid");
    expect(result.legs.map((leg) => leg.fillable)).toEqual([true, false, true]);
  });

  it("treats orderbook fetch errors as non-fillable without throwing", async () => {
    const fetchOrderBook = vi.fn(
      async (tokenId: string): Promise<OrderBook> => {
        if (tokenId === "m1-no") {
          throw new Error("book unavailable");
        }

        return makeOrderBook(0.6, 100);
      },
    );

    const result = await validateNegRiskOpportunity(
      makeNegRiskOpportunity(),
      5,
      {
        fetchOrderBook,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("partial_basket_invalid");
    expect(result.legs[0]?.reason).toBe("orderbook_error");
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/scanner/opportunityValidator.ts",
      "utf8",
    );

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toContain("placeOrder");
    expect(source).not.toContain("postOrder");
    expect(source).not.toContain("buyLimit");
    expect(source).not.toContain("sellPosition");
  });
});

function makeOrderBook(price: number, size: number): OrderBook {
  return {
    bids: [{ price: price - 0.02, size }],
    asks: [{ price, size }],
  };
}

function makeWithinMarketOpportunity(): WithinMarketArbOpportunity {
  return {
    slug: "binary-market",
    question: "Will this resolve yes?",
    askYes: 0.5,
    askNo: 0.5,
    totalCost: 1,
    expectedEdge: 0,
    tokenIds: {
      yes: "yes-token",
      no: "no-token",
    },
    reason: "yes_no_ask_sum_below_threshold",
  };
}

function makeNegRiskOpportunity(): NegRiskBracketOpportunity {
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
        yesPrice: 0.42,
        sideToPaperTrade: "NO",
      },
      {
        marketId: "m2",
        slug: "one-cut",
        question: "One cut?",
        yesTokenId: "m2-yes",
        noTokenId: "m2-no",
        yesPrice: 0.39,
        sideToPaperTrade: "NO",
      },
      {
        marketId: "m3",
        slug: "two-cuts",
        question: "Two cuts?",
        yesTokenId: "m3-yes",
        noTokenId: "m3-no",
        yesPrice: 0.25,
        sideToPaperTrade: "NO",
      },
    ],
  };
}
