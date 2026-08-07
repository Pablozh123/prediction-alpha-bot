import { describe, expect, it } from "vitest";
import { calculateNegRiskBasketSizing } from "../src/scanner/basketSizing.js";

describe("NEG_RISK basket sizing", () => {
  it("calculates executable basket shares, edge bps, and ROI bps", () => {
    const result = calculateNegRiskBasketSizing(
      [
        {
          tokenId: "no-1",
          slug: "first",
          orderbook: {
            bids: [],
            asks: [
              { price: 0.35, size: 10 },
              { price: 0.4, size: 10 }
            ]
          }
        },
        {
          tokenId: "no-2",
          slug: "second",
          orderbook: {
            bids: [],
            asks: [
              { price: 0.4, size: 10 },
              { price: 0.7, size: 10 }
            ]
          }
        }
      ],
      1
    );

    expect(result).toMatchObject({
      basketSizeShares: 1,
      basketCostUsd: 0.75,
      basketPayoutUsd: 1,
      basketProfitUsd: 0.25,
      edgePerShare: 0.25,
      edgeBps: 2500,
      roiBps: 3333.33
    });
    expect(result?.legs).toEqual([
      {
        tokenId: "no-1",
        slug: "first",
        shares: 1,
        averageFillPrice: 0.35,
        costUsd: 0.35
      },
      {
        tokenId: "no-2",
        slug: "second",
        shares: 1,
        averageFillPrice: 0.4,
        costUsd: 0.4
      }
    ]);
  });

  it("caps the paper basket at the largest positive common basket size", () => {
    const result = calculateNegRiskBasketSizing(
      [
        {
          tokenId: "no-1",
          slug: "first",
          orderbook: {
            bids: [],
            asks: [
              { price: 0.35, size: 1 },
              { price: 0.9, size: 10 }
            ]
          }
        },
        {
          tokenId: "no-2",
          slug: "second",
          orderbook: {
            bids: [],
            asks: [
              { price: 0.4, size: 1 },
              { price: 0.9, size: 10 }
            ]
          }
        }
      ],
      10
    );

    expect(result?.basketSizeShares).toBeLessThan(10);
    expect(result?.maxPositiveBasketShares).toBeCloseTo(1.3125, 5);
    expect(result?.basketProfitUsd).toBeGreaterThan(0);
  });

  it("returns null when the basket has no positive edge", () => {
    expect(
      calculateNegRiskBasketSizing([
        {
          tokenId: "no-1",
          slug: "first",
          orderbook: {
            bids: [],
            asks: [{ price: 0.55, size: 10 }]
          }
        },
        {
          tokenId: "no-2",
          slug: "second",
          orderbook: {
            bids: [],
            asks: [{ price: 0.55, size: 10 }]
          }
        }
      ])
    ).toBeNull();
  });
});
