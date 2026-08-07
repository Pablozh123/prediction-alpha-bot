import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import {
  fetchOrderBook,
  getBestBidAsk,
  walkAsksForShares,
  walkAsksForSize,
  walkBidsForShares,
  type OrderBook
} from "../src/utils/orderbook.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn()
  }
}));

describe("orderbook utilities", () => {
  it("fetches an orderbook with read-only public params and no auth", async () => {
    const get = vi.mocked(axios.get);
    get.mockResolvedValueOnce({
      data: {
        token_id: "yes-token",
        bids: [{ price: "0.44", size: "20" }],
        asks: [{ price: "0.45", size: "20" }]
      }
    });

    await expect(fetchOrderBook("yes-token")).resolves.toEqual({
      tokenId: "yes-token",
      bids: [{ price: 0.44, size: 20 }],
      asks: [{ price: 0.45, size: 20 }]
    });
    expect(get).toHaveBeenCalledWith("https://clob.polymarket.com/book", {
      params: {
        token_id: "yes-token"
      },
      timeout: 10_000
    });
    expect(JSON.stringify(get.mock.calls)).not.toContain("authorization");
  });

  it("wraps API failures with a clear token-specific error", async () => {
    const get = vi.mocked(axios.get);
    get.mockRejectedValue(new Error("network unavailable"));

    await expect(fetchOrderBook("no-token")).rejects.toThrow(
      'Failed to fetch orderbook for token "no-token": network unavailable'
    );
    get.mockReset();
  });

  it("returns null bid and ask for an empty orderbook", () => {
    expect(getBestBidAsk({ bids: [], asks: [] })).toEqual({
      bestBid: null,
      bestAsk: null
    });
    expect(walkAsksForSize({ bids: [], asks: [] }, 5)).toEqual({
      fillable: false,
      averageFillPrice: null,
      maxFillableUsd: 0,
      requestedSizeUsd: 5
    });
  });

  it("calculates best bid, best ask, average fill and max fillable USD", () => {
    const orderbook: OrderBook = {
      bids: [
        { price: 0.41, size: 10 },
        { price: 0.43, size: 5 }
      ],
      asks: [
        { price: 0.47, size: 10 },
        { price: 0.45, size: 10 }
      ]
    };

    expect(getBestBidAsk(orderbook)).toEqual({
      bestBid: 0.43,
      bestAsk: 0.45
    });
    expect(walkAsksForSize(orderbook, 6.75)).toEqual({
      fillable: true,
      averageFillPrice: 0.456475,
      maxFillableUsd: 9.2,
      requestedSizeUsd: 6.75
    });
    expect(walkAsksForShares(orderbook, 12)).toEqual({
      fillable: true,
      averageFillPrice: 0.453333,
      costUsd: 5.44,
      requestedShares: 12
    });
    expect(walkBidsForShares(orderbook, 12)).toEqual({
      fillable: true,
      averageFillPrice: 0.418333,
      proceedsUsd: 5.02,
      requestedShares: 12
    });
  });

  it("reports not fillable when visible asks cannot satisfy target size", () => {
    expect(
      walkAsksForSize(
        {
          bids: [],
          asks: [{ price: 0.5, size: 4 }]
        },
        3
      )
    ).toEqual({
      fillable: false,
      averageFillPrice: 0.5,
      maxFillableUsd: 2,
      requestedSizeUsd: 3
    });
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/utils/orderbook.ts", "utf8");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toContain("placeOrder");
    expect(source).not.toContain("postOrder");
    expect(source).not.toContain("buyLimit");
    expect(source).not.toContain("sellPosition");
  });
});
