import { describe, expect, it } from "vitest";
import {
  buildCrossVenueCanonicalEvent,
  canonicalizeKalshiMarket,
  canonicalizePolymarketBinaryMarket,
} from "../src/scanner/canonicalPredictionMarket.js";

describe("canonical prediction market model", () => {
  it("canonicalizes a Kalshi binary market into one event and YES outcome", () => {
    const event = canonicalizeKalshiMarket({
      ticker: "KXINFLATION-26-ABOVE4",
      eventTicker: "KXINFLATION-26",
      title: "How high will inflation get in 2026?",
      subtitle: "US CPI inflation",
      yesSubTitle: "Above 4%",
      noSubTitle: "Not above 4%",
      rulesPrimary:
        "Resolves Yes if US CPI inflation for 2026 is above 4 percent.",
      closeTime: Date.UTC(2027, 0, 15, 23, 59, 59),
      liquidityDollars: 1000,
      volume24h: 25,
    });

    expect(event).toMatchObject({
      id: "event:kalshi:kxinflation-26",
      eventKey: "how-high-will-inflation-get-in-2026-2027-01-15",
      title: "How high will inflation get in 2026?",
      expectedResolutionAt: Date.UTC(2027, 0, 15, 23, 59, 59),
      outcomes: [
        {
          outcomeKey: "above-4-percent",
          label: "Above 4%",
          side: "YES",
          venueRefs: [
            expect.objectContaining({
              venue: "kalshi",
              eventId: "KXINFLATION-26",
              marketId: "KXINFLATION-26-ABOVE4",
              ticker: "KXINFLATION-26-ABOVE4",
            }),
          ],
        },
      ],
    });
  });

  it("canonicalizes a Polymarket binary market with token ids and rules", () => {
    const event = canonicalizePolymarketBinaryMarket({
      slug: "will-us-inflation-be-above-4-percent-in-2026",
      question: "Will US inflation be above 4% in 2026?",
      yesTokenId: "poly-yes",
      noTokenId: "poly-no",
      category: "finance",
      expectedResolutionAt: Date.UTC(2027, 0, 15, 23, 59, 59),
      rulesText:
        "This market resolves Yes if US CPI inflation for 2026 is above 4 percent.",
      resolutionSource: "Bureau of Labor Statistics CPI release",
    });

    expect(event).toMatchObject({
      id: "event:polymarket:will-us-inflation-be-above-4-percent-in-2026",
      category: "finance",
      resolutionSource: "Bureau of Labor Statistics CPI release",
      outcomes: [
        {
          outcomeKey: "yes",
          venueRefs: [
            expect.objectContaining({
              venue: "polymarket",
              slug: "will-us-inflation-be-above-4-percent-in-2026",
              yesTokenId: "poly-yes",
              noTokenId: "poly-no",
            }),
          ],
        },
      ],
    });
  });

  it("builds one matched canonical outcome with both venue refs", () => {
    const { event, outcome } = buildCrossVenueCanonicalEvent({
      title: "How high will inflation get in 2026?",
      outcomeLabel: "Above 4%",
      category: "finance",
      expectedResolutionAt: Date.UTC(2027, 0, 15, 23, 59, 59),
      kalshi: {
        ticker: "KXINFLATION-26-ABOVE4",
        eventTicker: "KXINFLATION-26",
        title: "How high will inflation get in 2026?",
        yesSubTitle: "Above 4%",
        rulesPrimary:
          "Resolves Yes if US CPI inflation for 2026 is above 4 percent.",
      },
      polymarket: {
        slug: "will-us-inflation-be-above-4-percent-in-2026",
        question: "Will US inflation be above 4% in 2026?",
        yesTokenId: "poly-yes",
        noTokenId: "poly-no",
        rulesText:
          "This market resolves Yes if US CPI inflation for 2026 is above 4 percent.",
      },
    });

    expect(event.id).toBe(
      "event:how-high-will-inflation-get-in-2026-2027-01-15",
    );
    expect(outcome).toMatchObject({
      id: "outcome:how-high-will-inflation-get-in-2026-2027-01-15:above-4-percent",
      eventId: event.id,
      outcomeKey: "above-4-percent",
      venueRefs: [
        expect.objectContaining({ venue: "kalshi" }),
        expect.objectContaining({ venue: "polymarket" }),
      ],
    });
  });
});
