import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NEG_RISK_SUM_THRESHOLD,
  scanNegRiskBracketEvents
} from "../src/scanner/negRiskBracketScanner.js";
import type { GammaRawEvent } from "../src/utils/gamma.js";

describe("scanNegRiskBracketEvents", () => {
  it("creates an opportunity when YES prices exceed the default threshold", () => {
    const events = [
      makeEvent("rate-cuts-2026", [
        makeMarket("m1", "zero-cuts", "Zero cuts?", "0.40"),
        makeMarket("m2", "one-cut", "One cut?", "0.35"),
        makeMarket("m3", "two-cuts", "Two cuts?", "0.31")
      ])
    ];

    expect(scanNegRiskBracketEvents(events)).toEqual([
      {
        eventSlug: "rate-cuts-2026",
        sumYes: 1.06,
        threshold: DEFAULT_NEG_RISK_SUM_THRESHOLD,
        expectedEdge: 0.03,
        // the markets of the fixture carry the venue flag; the event does not
        negRisk: true,
        negRiskAugmented: null,
        marketCount: 3,
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
          },
          {
            marketId: "m3",
            slug: "two-cuts",
            question: "Two cuts?",
            yesTokenId: "m3-yes",
            noTokenId: "m3-no",
            yesPrice: 0.31,
            sideToPaperTrade: "NO"
          }
        ]
      }
    ]);
  });

  it("returns no opportunity when the sum does not exceed the threshold", () => {
    const events = [
      makeEvent("efficient-event", [
        makeMarket("m1", "a", "A?", "0.30"),
        makeMarket("m2", "b", "B?", "0.30"),
        makeMarket("m3", "c", "C?", "0.30")
      ])
    ];

    expect(scanNegRiskBracketEvents(events)).toEqual([]);
  });

  it("supports custom thresholds", () => {
    const events = [
      makeEvent("custom-threshold-event", [
        makeMarket("m1", "a", "A?", "0.34"),
        makeMarket("m2", "b", "B?", "0.34"),
        makeMarket("m3", "c", "C?", "0.32")
      ])
    ];

    const [opportunity] = scanNegRiskBracketEvents(events, {
      threshold: 0.99
    });

    expect(opportunity).toMatchObject({
      eventSlug: "custom-threshold-event",
      sumYes: 1,
      threshold: 0.99,
      expectedEdge: 0.01
    });
  });

  it("skips and warns when an event has fewer than 3 markets", () => {
    const warn = vi.fn();
    const events = [
      makeEvent("too-small", [
        makeMarket("m1", "a", "A?", "0.50"),
        makeMarket("m2", "b", "B?", "0.50")
      ])
    ];

    expect(scanNegRiskBracketEvents(events, { warn })).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping NEG_RISK event "too-small": expected at least 3 markets, got 2.'
    );
  });

  it("skips and warns when token ids are missing", () => {
    const warn = vi.fn();
    const events = [
      makeEvent("missing-token", [
        makeMarket("m1", "a", "A?", "0.40"),
        {
          ...makeMarket("m2", "b", "B?", "0.35"),
          clobTokenIds: '["m2-yes"]'
        },
        makeMarket("m3", "c", "C?", "0.31")
      ])
    ];

    expect(scanNegRiskBracketEvents(events, { warn })).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping NEG_RISK event "missing-token": market "m2" missing YES/NO token ids.'
    );
  });

  it("skips and warns when YES price is implausible", () => {
    const warn = vi.fn();
    const events = [
      makeEvent("bad-price", [
        makeMarket("m1", "a", "A?", "0.40"),
        makeMarket("m2", "b", "B?", "1.20"),
        makeMarket("m3", "c", "C?", "0.31")
      ])
    ];

    expect(scanNegRiskBracketEvents(events, { warn })).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping NEG_RISK event "bad-price": market "m2" has implausible YES price.'
    );
  });

  it("skips exact zero or one prices as non-executable without orderbook depth", () => {
    const warn = vi.fn();
    const events = [
      makeEvent("edge-price", [
        makeMarket("m1", "a", "A?", "0.40"),
        makeMarket("m2", "b", "B?", "1"),
        makeMarket("m3", "c", "C?", "0.31")
      ])
    ];

    expect(scanNegRiskBracketEvents(events, { warn })).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Skipping NEG_RISK event "edge-price": market "m2" has implausible YES price.'
    );
  });

  it("parses already parsed arrays", () => {
    const events = [
      makeEvent("parsed-arrays", [
        makeMarket("m1", "a", "A?", "0.40"),
        {
          ...makeMarket("m2", "b", "B?", "0.35"),
          clobTokenIds: ["m2-yes", "m2-no"],
          outcomePrices: ["0.35", "0.65"]
        },
        makeMarket("m3", "c", "C?", "0.31")
      ])
    ];

    const [opportunity] = scanNegRiskBracketEvents(events);

    expect(opportunity?.legs[1]).toMatchObject({
      yesTokenId: "m2-yes",
      noTokenId: "m2-no",
      yesPrice: 0.35
    });
  });
});

function makeEvent(slug: string, markets: GammaRawEvent["markets"]): GammaRawEvent {
  return {
    slug,
    markets
  };
}

function makeMarket(
  id: string,
  slug: string,
  question: string,
  yesPrice: string
): NonNullable<GammaRawEvent["markets"]>[number] {
  return {
    id,
    slug,
    question,
    negRisk: true,
    clobTokenIds: JSON.stringify([`${id}-yes`, `${id}-no`]),
    outcomePrices: JSON.stringify([yesPrice, String(1 - Number(yesPrice))]),
    outcomes: '["Yes","No"]'
  };
}
