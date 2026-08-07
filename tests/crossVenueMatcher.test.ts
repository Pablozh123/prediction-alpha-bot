import { describe, expect, it, vi } from "vitest";
import {
  buildPolymarketBinaryMarkets,
  classifyKalshiCrossVenueEligibility,
  discoverCrossVenuePairs,
  matchCrossVenueMarkets,
  normalizeTextTokens,
  rankCrossVenueMatchCandidates,
} from "../src/scanner/crossVenueMatcher.js";
import type { GammaRawEvent } from "../src/utils/gamma.js";
import type { KalshiMarket } from "../src/utils/kalshi.js";

describe("cross venue matcher", () => {
  it("extracts Polymarket binary YES/NO token IDs from Gamma events", () => {
    expect(buildPolymarketBinaryMarkets([makeGammaEvent()])).toEqual([
      {
        slug: "fed-cut-rates-in-june",
        question: "Will the Fed cut rates in June?",
        yesTokenId: "poly-yes",
        noTokenId: "poly-no",
        category: "finance",
        expectedResolutionAt: Date.UTC(2026, 5, 30, 23, 59, 59),
        liquidityDollars: 2500.5,
        volume24h: 300.25,
      },
    ]);
  });

  it("matches clearly similar Kalshi and Polymarket markets", () => {
    const matches = matchCrossVenueMarkets(
      [makeKalshiMarket()],
      buildPolymarketBinaryMarkets([makeGammaEvent()]),
      { minMatchScore: 0.5 },
    );

    expect(matches).toEqual([
      expect.objectContaining({
        kalshi: expect.objectContaining({ ticker: "KXFEDCUT-26JUN" }),
        polymarket: expect.objectContaining({
          slug: "fed-cut-rates-in-june",
          yesTokenId: "poly-yes",
          noTokenId: "poly-no",
          liquidityDollars: 2500.5,
          volume24h: 300.25,
        }),
        category: "finance",
        liquidityDollars: 3500.5,
        volume24h: 400.25,
        canonicalEvent: expect.objectContaining({
          id: "event:will-the-fed-cut-rates-in-june-2026-06-30",
          eventKey: "will-the-fed-cut-rates-in-june-2026-06-30",
        }),
        canonicalOutcome: expect.objectContaining({
          outcomeKey: "yes",
          venueRefs: [
            expect.objectContaining({
              venue: "kalshi",
              marketId: "KXFEDCUT-26JUN",
            }),
            expect.objectContaining({
              venue: "polymarket",
              yesTokenId: "poly-yes",
              noTokenId: "poly-no",
            }),
          ],
        }),
        matchScore: expect.any(Number),
        matchReason: expect.stringContaining("fed"),
      }),
    ]);
  });

  it("rejects unrelated markets below the match threshold", () => {
    const matches = matchCrossVenueMarkets(
      [makeKalshiMarket()],
      [
        {
          slug: "nba-champion-2026",
          question: "Will the Knicks win the 2026 NBA championship?",
          yesTokenId: "yes",
          noTokenId: "no",
          expectedResolutionAt: Date.UTC(2026, 5, 30, 23, 59, 59),
        },
      ],
      { minMatchScore: 0.5 },
    );

    expect(matches).toEqual([]);
  });

  it("rejects generic same-frame markets when the distinct entity differs", () => {
    const matches = matchCrossVenueMarkets(
      [
        makeKalshiMarket({
          ticker: "KXTRUMP-28",
          eventTicker: "KXPRES-28",
          title: "Will Donald Trump win the 2028 presidential election?",
          subtitle: "2028 presidential election",
          yesSubTitle: "Donald Trump",
          expectedExpirationTime: Date.UTC(2028, 10, 8, 23, 59, 59),
          closeTime: Date.UTC(2028, 10, 8, 23, 59, 59),
        }),
      ],
      [
        {
          slug: "gavin-newsom-2028-president",
          question: "Will Gavin Newsom win the 2028 presidential election?",
          yesTokenId: "newsom-yes",
          noTokenId: "newsom-no",
          expectedResolutionAt: Date.UTC(2028, 10, 8, 23, 59, 59),
        },
      ],
      { minMatchScore: 0.1 },
    );

    expect(matches).toEqual([]);
  });

  it("rejects ambiguous Polymarket duplicates without a clear best match", () => {
    const poly = {
      question: "Will the Fed cut rates in June?",
      expectedResolutionAt: Date.UTC(2026, 5, 30, 23, 59, 59),
    };
    const matches = matchCrossVenueMarkets(
      [makeKalshiMarket()],
      [
        {
          ...poly,
          slug: "fed-cut-rates-in-june-a",
          yesTokenId: "poly-a-yes",
          noTokenId: "poly-a-no",
        },
        {
          ...poly,
          slug: "fed-cut-rates-in-june-b",
          yesTokenId: "poly-b-yes",
          noTokenId: "poly-b-no",
        },
      ],
      { minMatchScore: 0.5 },
    );

    expect(matches).toEqual([]);
  });

  it("filters compound Kalshi multileg markets out of executable matching", () => {
    const compound = makeKalshiMarket({
      eventTicker: "KXMVESPORTSMULTIGAMEEXTENDED",
      ticker: "KXMVESPORTSMULTIGAMEEXTENDED-TEST",
      title:
        "yes Atlanta wins by over 1.5 runs,yes Milwaukee wins by over 1.5 runs,yes Los Angeles wins by over 1.5 runs",
    });
    const polyMarkets = buildPolymarketBinaryMarkets([makeGammaEvent()]);

    expect(classifyKalshiCrossVenueEligibility(compound)).toEqual({
      eligible: false,
      reason: "compound_kalshi_market",
    });
    expect(
      matchCrossVenueMarkets([compound], polyMarkets, { minMatchScore: 0.1 }),
    ).toEqual([]);
  });

  it("rejects otherwise similar markets when resolution dates are too far apart", () => {
    const matches = matchCrossVenueMarkets(
      [makeKalshiMarket()],
      [
        {
          slug: "fed-cut-rates-in-june-2027",
          question: "Will the Fed cut rates in June?",
          yesTokenId: "poly-yes",
          noTokenId: "poly-no",
          expectedResolutionAt: Date.UTC(2027, 5, 30, 23, 59, 59),
        },
      ],
      { minMatchScore: 0.5 },
    );

    expect(matches).toEqual([]);
  });

  it("rejects similar inflation markets when numeric thresholds differ", () => {
    const kalshi = makeKalshiMarket({
      ticker: "KXINFLATION-26-ABOVE4",
      eventTicker: "KXINFLATION-26",
      title: "How high will inflation get in 2026?",
      subtitle: "US CPI inflation in 2026",
      yesSubTitle: "Above 4%",
      noSubTitle: "Not above 4%",
      rulesPrimary:
        "Resolves Yes if US CPI inflation for 2026 is above 4 percent.",
      expectedExpirationTime: Date.UTC(2027, 0, 15, 23, 59, 59),
      closeTime: Date.UTC(2027, 0, 15, 23, 59, 59),
    });
    const polymarket = {
      slug: "how-high-will-us-inflation-get-in-2026-above-5",
      question: "Will US inflation be above 5% in 2026?",
      yesTokenId: "poly-yes",
      noTokenId: "poly-no",
      expectedResolutionAt: Date.UTC(2027, 0, 15, 23, 59, 59),
      rulesText:
        "This market resolves Yes if US inflation for 2026 is above 5 percent.",
    };

    expect(
      matchCrossVenueMarkets([kalshi], [polymarket], { minMatchScore: 0.1 }),
    ).toEqual([]);

    expect(
      rankCrossVenueMatchCandidates([kalshi], [polymarket], {
        minMatchScore: 0.1,
      })[0],
    ).toMatchObject({
      status: "resolution_terms_mismatch",
      matchReason: expect.stringContaining("resolution=threshold_mismatch"),
    });
  });

  it("rejects same-deadline markets when material resolution terms differ", () => {
    const closeTime = Date.UTC(2027, 0, 1, 4, 59, 0);
    const kalshi = makeKalshiMarket({
      ticker: "KXRECOGSOMALI-29-27",
      eventTicker: "KXRECOGSOMALI-29",
      title: "Will Trump recognize Somaliland?",
      subtitle: "",
      yesSubTitle: "Before 2027",
      noSubTitle: "Before 2027",
      closeTime,
      expectedExpirationTime: closeTime,
    });
    const polymarket = {
      slug: "will-trump-resign-before-2027",
      question: "Will Trump resign before 2027?",
      yesTokenId: "poly-yes",
      noTokenId: "poly-no",
      expectedResolutionAt: closeTime,
      rulesText:
        "This market resolves Yes if Trump resigns the presidency before 2027.",
    };

    expect(
      matchCrossVenueMarkets([kalshi], [polymarket], { minMatchScore: 0.1 }),
    ).toEqual([]);
    expect(
      rankCrossVenueMatchCandidates([kalshi], [polymarket], {
        minMatchScore: 0.1,
      })[0]?.status,
    ).toBe("resolution_terms_mismatch");
  });

  it("keeps same-resolution markets when text, date, and threshold agree", () => {
    const kalshi = makeKalshiMarket({
      ticker: "KXINFLATION-26-ABOVE4",
      eventTicker: "KXINFLATION-26",
      title: "How high will inflation get in 2026?",
      subtitle: "US CPI inflation in 2026",
      yesSubTitle: "Above 4%",
      noSubTitle: "Not above 4%",
      rulesPrimary:
        "Resolves Yes if US CPI inflation for 2026 is above 4 percent.",
      expectedExpirationTime: Date.UTC(2027, 0, 15, 23, 59, 59),
      closeTime: Date.UTC(2027, 0, 15, 23, 59, 59),
    });
    const polymarket = {
      slug: "will-us-inflation-be-above-4-percent-in-2026",
      question: "Will US inflation be above 4% in 2026?",
      yesTokenId: "poly-yes",
      noTokenId: "poly-no",
      expectedResolutionAt: Date.UTC(2027, 0, 15, 23, 59, 59),
      rulesText:
        "This market resolves Yes if US CPI inflation for 2026 is above 4 percent.",
    };

    expect(
      matchCrossVenueMarkets([kalshi], [polymarket], { minMatchScore: 0.1 }),
    ).toEqual([
      expect.objectContaining({
        kalshi: expect.objectContaining({ ticker: "KXINFLATION-26-ABOVE4" }),
        polymarket: expect.objectContaining({
          slug: "will-us-inflation-be-above-4-percent-in-2026",
        }),
      }),
    ]);
  });

  it("uses Kalshi close time for dated submarkets instead of later series expiration", () => {
    const closeTime = Date.UTC(2027, 0, 1, 4, 59, 0);
    const matches = matchCrossVenueMarkets(
      [
        makeKalshiMarket({
          ticker: "KXRECOGSOMALI-29-27",
          eventTicker: "KXRECOGSOMALI-29",
          title: "Will Trump recognize Somaliland?",
          subtitle: "",
          yesSubTitle: "Before 2027",
          noSubTitle: "Before 2027",
          closeTime,
          expectedExpirationTime: Date.UTC(2029, 0, 20, 15, 0, 0),
        }),
      ],
      [
        {
          slug: "will-trump-recognize-somaliland-before-2027",
          question: "Will Trump recognize Somaliland before 2027?",
          yesTokenId: "poly-yes",
          noTokenId: "poly-no",
          expectedResolutionAt: closeTime,
        },
      ],
      { minMatchScore: 0.7 },
    );

    expect(matches).toEqual([
      expect.objectContaining({
        kalshi: expect.objectContaining({ ticker: "KXRECOGSOMALI-29-27" }),
        polymarket: expect.objectContaining({
          slug: "will-trump-recognize-somaliland-before-2027",
        }),
      }),
    ]);
  });

  it("discovers pairs with mocked read-only fetchers and applies limits", async () => {
    const fetchGammaEvents = vi.fn(async () => [makeGammaEvent()]);
    const fetchKalshiMarkets = vi.fn(async () => [
      makeKalshiMarket({ liquidityDollars: 10 }),
      makeKalshiMarket({
        ticker: "KXFEDCUT-ALT",
        liquidityDollars: 100,
      }),
    ]);

    const matches = await discoverCrossVenuePairs({
      fetchGammaEvents,
      fetchKalshiMarkets,
      gammaLimit: 5,
      kalshiLimit: 10,
      maxPairs: 1,
      minMatchScore: 0.5,
    });

    expect(fetchGammaEvents).toHaveBeenCalledWith(5);
    expect(fetchKalshiMarkets).toHaveBeenCalledWith({
      limit: 10,
      maxPages: 5,
      status: "open",
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.kalshi.ticker).toBe("KXFEDCUT-ALT");
  });

  it("discovers pairs from targeted Gamma public-search events", async () => {
    const fetchGammaEvents = vi.fn(async () => {
      throw new Error("broad feed should not be used");
    });
    const fetchGammaSearchEvents = vi.fn(async () => [
      { id: "poly-event", ...makeGammaEvent() },
      { id: "poly-event", ...makeGammaEvent() },
    ]);
    const fetchKalshiMarkets = vi.fn(async () => [makeKalshiMarket()]);

    const matches = await discoverCrossVenuePairs({
      fetchGammaEvents,
      fetchGammaSearchEvents,
      fetchKalshiMarkets,
      gammaSearchLimit: 7,
      gammaSearchQueries: ["fed", " fed "],
      minMatchScore: 0.5,
    });

    expect(fetchGammaEvents).not.toHaveBeenCalled();
    expect(fetchGammaSearchEvents).toHaveBeenCalledTimes(1);
    expect(fetchGammaSearchEvents).toHaveBeenCalledWith("fed", 7);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.polymarket.slug).toBe("fed-cut-rates-in-june");
  });

  it("normalizes text tokens for stable matching", () => {
    expect(normalizeTextTokens("Will USA rates & elections win?")).toContain("us");
    expect(normalizeTextTokens("Will USA rates & elections win?")).toContain("rate");
  });

  it("includes full local-pair fields in near-match previews", () => {
    const candidates = rankCrossVenueMatchCandidates(
      [makeKalshiMarket()],
      buildPolymarketBinaryMarkets([makeGammaEvent()]),
      { minMatchScore: 0.9 },
    );

    expect(candidates[0]).toMatchObject({
      kalshiTicker: "KXFEDCUT-26JUN",
      polymarketSlug: "fed-cut-rates-in-june",
      yesTokenId: "poly-yes",
      noTokenId: "poly-no",
      outcomeLabel: "Yes",
      canonicalEventId: "event:will-the-fed-cut-rates-in-june-2026-06-30",
      canonicalOutcomeKey: "yes",
      status: "below_match_threshold",
    });
  });

  it("labels compound Kalshi markets in near-match previews", () => {
    const candidates = rankCrossVenueMatchCandidates(
      [
        makeKalshiMarket({
          eventTicker: "KXMVECROSSCATEGORY",
          ticker: "KXMVECROSSCATEGORY-TEST",
          title: "yes Fed cut,yes Fed hike,no Fed pause",
        }),
      ],
      buildPolymarketBinaryMarkets([makeGammaEvent()]),
      { minMatchScore: 0.1 },
    );

    expect(candidates[0]?.status).toBe("compound_kalshi_market");
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/scanner/crossVenueMatcher.ts", "utf8");

    expect(source).not.toContain("@polymarket/clob-client");
    expect(source).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(source).not.toMatch(/private[_-]?key|seed phrase/i);
  });
});

function makeGammaEvent(): GammaRawEvent {
  return {
    endDate: "2026-06-30T23:59:59Z",
    markets: [
      {
        id: "poly-market-id",
        slug: "fed-cut-rates-in-june",
        question: "Will the Fed cut rates in June?",
        category: "finance",
        liquidity: "2500.5",
        volume24hr: "300.25",
        clobTokenIds: '["poly-yes","poly-no"]',
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.42","0.58"]',
      },
    ],
  };
}

function makeKalshiMarket(overrides: Partial<KalshiMarket> = {}): KalshiMarket {
  return {
    ticker: "KXFEDCUT-26JUN",
    eventTicker: "KXFEDCUT",
    title: "Will the Fed cut rates in June?",
    subtitle: "Federal Reserve rate decision",
    yesSubTitle: "Yes",
    noSubTitle: "No",
    expectedExpirationTime: Date.UTC(2026, 5, 30, 23, 59, 59),
    closeTime: Date.UTC(2026, 5, 30, 23, 59, 59),
    yesAsk: 0.42,
    noAsk: 0.58,
    liquidityDollars: 1000,
    volume24h: 100,
    ...overrides,
  };
}
