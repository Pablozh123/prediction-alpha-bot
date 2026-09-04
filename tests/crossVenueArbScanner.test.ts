import { describe, expect, it, vi } from "vitest";
import {
  buildKalshiCrossVenueBook,
  buildPolymarketCrossVenueBook,
  calculateCrossVenueArbs,
  calculateCrossVenuePriceSpreads,
  scanCrossVenuePairs,
  walkCrossVenueAskLadders,
  type CrossVenuePair,
} from "../src/scanner/crossVenueArbScanner.js";
import { LiveOrderBookCache } from "../src/scanner/liveOrderbookCache.js";
import type { KalshiOrderBook } from "../src/utils/kalshi.js";
import type { OrderBook } from "../src/utils/orderbook.js";

describe("cross venue arb scanner", () => {
  it("finds OddPool-style YES+NO cross-venue arbs after fees", () => {
    const opportunities = calculateCrossVenueArbs(
      makePair(),
      [
        {
          venue: "kalshi",
          identifier: "KXTEST-YES",
          yesAskLevels: [{ price: 0.42, size: 10 }],
          noAskLevels: [{ price: 0.66, size: 10 }],
          bestYesAsk: 0.42,
          bestNoAsk: 0.66,
        },
        {
          venue: "polymarket",
          identifier: "poly-market",
          yesAskLevels: [{ price: 0.56, size: 10 }],
          noAskLevels: [{ price: 0.5, size: 5 }],
          bestYesAsk: 0.56,
          bestNoAsk: 0.5,
        },
      ],
      {
        feesCents: {
          kalshi: 0.5,
          polymarket: 0.5,
        },
        minNetCents: 1,
      },
    );

    expect(opportunities).toEqual([
      expect.objectContaining({
        buyYesVenue: "kalshi",
        buyNoVenue: "polymarket",
        grossCents: 8,
        feeCents: 1,
        netCents: 7,
        executableSize: 5,
        maxProfitDollars: 0.35,
        category: "finance",
        liquidityDollars: 1500,
        volume24h: 250,
        roiBps: 760.87,
        totalTopOfBookCost: 0.92,
        yesLeg: expect.objectContaining({
          averageFillPrice: 0.42,
          bestAsk: 0.42,
        }),
        noLeg: expect.objectContaining({
          averageFillPrice: 0.5,
          bestAsk: 0.5,
        }),
      }),
    ]);
  });

  it("prices every level with the venue fee curves when no flat fee is configured", () => {
    const [opportunity] = calculateCrossVenueArbs(
      makePair(),
      [
        {
          venue: "kalshi",
          identifier: "KXTEST-YES",
          yesAskLevels: [{ price: 0.42, size: 10 }],
          noAskLevels: [{ price: 0.66, size: 10 }],
          bestYesAsk: 0.42,
          bestNoAsk: 0.66,
        },
        {
          venue: "polymarket",
          identifier: "poly-market",
          yesAskLevels: [{ price: 0.56, size: 10 }],
          noAskLevels: [{ price: 0.5, size: 5 }],
          bestYesAsk: 0.56,
          bestNoAsk: 0.5,
        },
      ],
      {
        // zero flat fees are the legacy configuration and are not honoured
        feesCents: { kalshi: 0, polymarket: 0 },
        minNetCents: 1,
        nowMs: Date.UTC(2026, 5, 20),
      },
    );

    expect(opportunity).toMatchObject({
      feeModel: "curve",
      feeModelVersion: "2026-07-30",
      roleMode: "taker",
      grossCents: 8,
      // Kalshi taker 0.07 * 0.42 * 0.58 = 1.71c; Polymarket finance 0.04 * 0.25 = 1.00c
      feeCents: 2.71,
      netCents: 5.29,
      executableSize: 5,
      // 5 shares: Kalshi 0.0853 -> 0.09 after cent rounding, Polymarket 0.05
      maxProfitDollars: 0.26,
      capitalUsd: 4.6,
      executableNetEdgeBps: 565.22,
      daysToResolution: 10,
      annualizedPct: 206.3,
      ruleMatch: "unverified",
    });
    expect(opportunity?.yesLeg).toMatchObject({ role: "taker", feeUsd: 0.09, sizeUsd: 2.1 });
    expect(opportunity?.noLeg).toMatchObject({ role: "taker", feeUsd: 0.05, sizeUsd: 2.5 });
  });

  it("rests the pricier leg as maker when maker-first is configured", () => {
    const [opportunity] = calculateCrossVenueArbs(
      makePair(),
      [
        {
          venue: "kalshi",
          identifier: "KXTEST-YES",
          yesAskLevels: [{ price: 0.42, size: 10 }],
          noAskLevels: [{ price: 0.66, size: 10 }],
          bestYesAsk: 0.42,
          bestNoAsk: 0.66,
        },
        {
          venue: "polymarket",
          identifier: "poly-market",
          yesAskLevels: [{ price: 0.56, size: 10 }],
          noAskLevels: [{ price: 0.5, size: 5 }],
          bestYesAsk: 0.56,
          bestNoAsk: 0.5,
        },
      ],
      { minNetCents: 1, roleMode: "maker_first" },
    );

    expect(opportunity?.roleMode).toBe("maker_first");
    expect(opportunity?.yesLeg.role).toBe("maker");
    expect(opportunity?.noLeg.role).toBe("taker");
    // Kalshi maker: 5 * 0.0175 * 0.2436 = 0.0213 -> 0.03 after cent rounding
    expect(opportunity?.yesLeg.feeUsd).toBe(0.03);
  });

  it("reports why a scanned pair had no edge instead of dropping it", async () => {
    const result = await scanCrossVenuePairs([makePair()], {
      fetchKalshiBook: vi.fn(async () => makeKalshiBook()),
      fetchPolymarketBook: vi.fn(async () =>
        makePolymarketBook({ asks: [{ price: 0.6, size: 10 }] }),
      ),
      minNetCents: 0.5,
    });

    expect(result.opportunities).toEqual([]);
    expect(result.noEdge).toEqual([
      expect.objectContaining({
        pairId: "pair-1",
        reason: "non_positive_executable_edge",
      }),
    ]);
  });

  it("hard-excludes pairs whose titles ask different questions before reading any book", async () => {
    const fetchKalshiBook = vi.fn(async () => makeKalshiBook());
    const fetchPolymarketBook = vi.fn(async () => makePolymarketBook());
    const pair = makePair();
    pair.kalshi.title = "Michigan Democratic Senate primary margin of victory";
    pair.polymarket.question =
      "Will Abdul El-Sayed win the 2026 Michigan Democratic Senate primary?";

    const result = await scanCrossVenuePairs([pair], {
      fetchKalshiBook,
      fetchPolymarketBook,
      warn: vi.fn(),
    });

    expect(result.rejected).toEqual([
      expect.objectContaining({
        pairId: "pair-1",
        reason: "question_type_mismatch",
      }),
    ]);
    expect(result.opportunities).toEqual([]);
    expect(fetchKalshiBook).not.toHaveBeenCalled();
    expect(fetchPolymarketBook).not.toHaveBeenCalled();
  });

  it("does not flag pure price spreads as risk-free arbs", () => {
    const books = [
      {
        venue: "kalshi" as const,
        identifier: "KXTEST-YES",
        yesAskLevels: [{ price: 0.42, size: 10 }],
        noAskLevels: [{ price: 0.7, size: 10 }],
        bestYesAsk: 0.42,
        bestNoAsk: 0.7,
      },
      {
        venue: "polymarket" as const,
        identifier: "poly-market",
        yesAskLevels: [{ price: 0.5, size: 10 }],
        noAskLevels: [{ price: 0.64, size: 10 }],
        bestYesAsk: 0.5,
        bestNoAsk: 0.64,
      },
    ];

    expect(calculateCrossVenueArbs(makePair(), books)).toEqual([]);
    expect(calculateCrossVenuePriceSpreads(makePair(), books)).toContainEqual(
      expect.objectContaining({
        pairId: "pair-1",
        title: "Example market",
        outcomeLabel: "Example outcome",
        kalshiTicker: "KXTEST-YES",
        polymarketSlug: "poly-market",
        side: "YES",
        cheapVenue: "kalshi",
        richVenue: "polymarket",
        cheapPrice: 0.42,
        richPrice: 0.5,
        diffCents: 8,
        category: "finance",
        liquidityDollars: 1500,
        volume24h: 250,
        reason: "same_outcome_price_difference",
      }),
    );
  });

  it("walks both ask ladders and stops when deeper levels are no longer profitable", () => {
    expect(
      walkCrossVenueAskLadders(
        [
          { price: 0.42, size: 10 },
          { price: 0.45, size: 100 },
        ],
        [
          { price: 0.5, size: 5 },
          { price: 0.57, size: 100 },
        ],
        1,
      ),
    ).toEqual({
      executableSize: 5,
      maxProfitDollars: 0.35,
      yesAverageFillPrice: 0.42,
      noAverageFillPrice: 0.5,
    });
  });

  it("normalizes Kalshi and Polymarket books for scanning matched pairs", async () => {
    const result = await scanCrossVenuePairs([makePair()], {
      fetchKalshiBook: vi.fn(async () => makeKalshiBook()),
      fetchPolymarketBook: vi.fn(async (tokenId) =>
        tokenId === "yes-token"
          ? makePolymarketBook({
              asks: [{ price: 0.56, size: 10 }],
            })
          : makePolymarketBook({
              asks: [{ price: 0.5, size: 5 }],
            }),
      ),
      feesCents: {
        kalshi: 0,
        polymarket: 0,
      },
      minNetCents: 0.5,
    });

    expect(result.rejected).toEqual([]);
    expect(result.opportunities).toHaveLength(1);
    expect(result.priceSpreads).toHaveLength(2);
  });

  it("uses fresh live orderbook cache entries before polling REST", async () => {
    const cache = new LiveOrderBookCache();
    const fetchKalshiBook = vi.fn(async () => {
      throw new Error("Kalshi REST should not be called.");
    });
    const fetchPolymarketBook = vi.fn(async () => {
      throw new Error("Polymarket REST should not be called.");
    });

    cache.setKalshiBook("KXTEST-YES", makeKalshiBook(), "websocket");
    cache.setPolymarketBook(
      "yes-token",
      makePolymarketBook({ asks: [{ price: 0.56, size: 10 }] }),
      "websocket",
    );
    cache.setPolymarketBook(
      "no-token",
      makePolymarketBook({ asks: [{ price: 0.5, size: 5 }] }),
      "websocket",
    );

    const result = await scanCrossVenuePairs([makePair()], {
      fetchKalshiBook,
      fetchPolymarketBook,
      orderbookCache: cache,
      feesCents: {
        kalshi: 0,
        polymarket: 0,
      },
      minNetCents: 0.5,
    });

    expect(fetchKalshiBook).not.toHaveBeenCalled();
    expect(fetchPolymarketBook).not.toHaveBeenCalled();
    expect(result.opportunities).toHaveLength(1);
    expect(result.orderbookReads).toMatchObject({
      kalshi: {
        reads: 1,
        cacheHits: 1,
        liveWatchedHits: 0,
        websocketHits: 1,
        restFetches: 0,
      },
      polymarket: {
        reads: 2,
        cacheHits: 2,
        liveWatchedHits: 0,
        websocketHits: 2,
        restFetches: 0,
      },
      total: {
        reads: 3,
        cacheHits: 3,
        liveWatchedHits: 0,
        websocketHits: 3,
        restFetches: 0,
      },
    });
  });

  it("tracks stale cache misses and REST fallback writes", async () => {
    let now = 1_000;
    const cache = new LiveOrderBookCache({ maxAgeMs: 100, now: () => now });
    const fetchKalshiBook = vi.fn(async () => makeKalshiBook());
    const fetchPolymarketBook = vi.fn(async (tokenId) =>
      tokenId === "yes-token"
        ? makePolymarketBook({ asks: [{ price: 0.56, size: 10 }] })
        : makePolymarketBook({ asks: [{ price: 0.5, size: 5 }] }),
    );

    cache.setKalshiBook("KXTEST-YES", makeKalshiBook(), "websocket");
    cache.setPolymarketBook(
      "yes-token",
      makePolymarketBook({ asks: [{ price: 0.56, size: 10 }] }),
      "websocket",
    );
    cache.setPolymarketBook(
      "no-token",
      makePolymarketBook({ asks: [{ price: 0.5, size: 5 }] }),
      "websocket",
    );
    now = 2_000;

    const result = await scanCrossVenuePairs([makePair()], {
      fetchKalshiBook,
      fetchPolymarketBook,
      orderbookCache: cache,
      minNetCents: 0.5,
    });

    expect(fetchKalshiBook).toHaveBeenCalledTimes(1);
    expect(fetchPolymarketBook).toHaveBeenCalledTimes(2);
    expect(result.orderbookReads.total).toMatchObject({
      reads: 3,
      dedupedReads: 0,
      cacheHits: 0,
      staleCacheMisses: 3,
      restFetches: 3,
      restWrites: 3,
    });
  });

  it("uses live-watched stale baseline books without polling REST", async () => {
    let now = 1_000;
    const cache = new LiveOrderBookCache({ maxAgeMs: 100, now: () => now });
    const fetchKalshiBook = vi.fn(async () => {
      throw new Error("Kalshi REST should not be called.");
    });
    const fetchPolymarketBook = vi.fn(async () => {
      throw new Error("Polymarket REST should not be called.");
    });

    cache.setKalshiBook("KXTEST-YES", makeKalshiBook(), "rest");
    cache.setPolymarketBook(
      "yes-token",
      makePolymarketBook({ asks: [{ price: 0.56, size: 10 }] }),
      "rest",
    );
    cache.setPolymarketBook(
      "no-token",
      makePolymarketBook({ asks: [{ price: 0.5, size: 5 }] }),
      "rest",
    );
    cache.setKalshiLiveWatched(["KXTEST-YES"], true);
    cache.setPolymarketLiveWatched(["yes-token", "no-token"], true);
    now = 2_000;

    const result = await scanCrossVenuePairs([makePair()], {
      fetchKalshiBook,
      fetchPolymarketBook,
      orderbookCache: cache,
      minNetCents: 0.5,
    });

    expect(fetchKalshiBook).not.toHaveBeenCalled();
    expect(fetchPolymarketBook).not.toHaveBeenCalled();
    expect(result.opportunities).toHaveLength(1);
    expect(result.orderbookReads.total).toMatchObject({
      reads: 3,
      cacheHits: 3,
      liveWatchedHits: 3,
      restHits: 3,
      staleCacheMisses: 0,
      restFetches: 0,
    });
  });

  it("deduplicates repeated venue identifiers within one scan", async () => {
    const fetchKalshiBook = vi.fn(async () => makeKalshiBook());
    const fetchPolymarketBook = vi.fn(async (tokenId) =>
      tokenId === "yes-token"
        ? makePolymarketBook({ asks: [{ price: 0.56, size: 10 }] })
        : makePolymarketBook({ asks: [{ price: 0.5, size: 5 }] }),
    );
    const duplicatePair: CrossVenuePair = {
      ...makePair(),
      id: "pair-duplicate",
      title: "Duplicate local mapping",
    };

    const result = await scanCrossVenuePairs([makePair(), duplicatePair], {
      fetchKalshiBook,
      fetchPolymarketBook,
      minNetCents: 0.5,
    });

    expect(fetchKalshiBook).toHaveBeenCalledTimes(1);
    expect(fetchPolymarketBook).toHaveBeenCalledTimes(2);
    expect(result.opportunities).toHaveLength(2);
    expect(result.orderbookReads.total).toMatchObject({
      reads: 3,
      dedupedReads: 3,
      restFetches: 3,
    });
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/scanner/crossVenueArbScanner.ts", "utf8");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(source).not.toMatch(/private[_-]?key|seed phrase/i);
  });
});

function makePair(): CrossVenuePair {
  return {
    id: "pair-1",
    title: "Example market",
    outcomeLabel: "Example outcome",
    category: "finance",
    expectedResolutionAt: Date.UTC(2026, 5, 30),
    liquidityDollars: 1500,
    volume24h: 250,
    kalshi: {
      ticker: "KXTEST-YES",
      liquidityDollars: 1000,
      volume24h: 100,
    },
    polymarket: {
      slug: "poly-market",
      yesTokenId: "yes-token",
      noTokenId: "no-token",
      liquidityDollars: 500,
      volume24h: 150,
    },
  };
}

function makeKalshiBook(): KalshiOrderBook {
  return {
    ticker: "KXTEST-YES",
    yesBids: [{ price: 0.34, size: 10 }],
    noBids: [{ price: 0.58, size: 10 }],
    yesAsks: [{ price: 0.42, size: 10 }],
    noAsks: [{ price: 0.66, size: 10 }],
  };
}

function makePolymarketBook(overrides: Partial<OrderBook> = {}): OrderBook {
  return {
    bids: [],
    asks: [],
    ...overrides,
  };
}

describe("cross venue book builders", () => {
  it("builds venue books from normalized source books", () => {
    expect(buildKalshiCrossVenueBook(makeKalshiBook())).toMatchObject({
      venue: "kalshi",
      bestYesAsk: 0.42,
      bestNoAsk: 0.66,
    });
    expect(
      buildPolymarketCrossVenueBook(
        makePair(),
        makePolymarketBook({ asks: [{ price: 0.56, size: 10 }] }),
        makePolymarketBook({ asks: [{ price: 0.5, size: 5 }] }),
      ),
    ).toMatchObject({
      venue: "polymarket",
      bestYesAsk: 0.56,
      bestNoAsk: 0.5,
    });
  });
});
