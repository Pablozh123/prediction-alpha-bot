import { describe, expect, it } from "vitest";
import {
  evaluateCleanNegRiskBasket,
} from "../src/scanner/cleanBasketFilter.js";
import type { NegRiskBracketOpportunity } from "../src/scanner/negRiskBracketScanner.js";
import type { ValidatedNegRiskOpportunity } from "../src/scanner/opportunityValidator.js";

describe("clean basket filter", () => {
  it("accepts clean one-winner baskets with enough edge, capacity, depth, and tight spreads", () => {
    expect(
      evaluateCleanNegRiskBasket(
        makeOpportunity({
          eventSlug: "2026-nba-champion",
          legSlugs: [
            "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
            "will-the-new-york-knicks-win-the-2026-nba-finals",
            "will-the-oklahoma-city-thunder-win-the-2026-nba-finals",
          ],
        }),
        makeValidated(),
      ),
    ).toEqual({
      valid: true,
      reason: "clean_basket_validated",
    });
  });

  it("rejects nested by-date baskets because they are directional, not clean arbs", () => {
    expect(
      evaluateCleanNegRiskBasket(
        makeOpportunity({
          eventSlug: "will-russia-capture-kostyantynivka-by",
          legSlugs: [
            "will-russia-capture-kostyantynivka-by-may-31",
            "will-russia-capture-kostyantynivka-by-june-30",
            "will-russia-capture-kostyantynivka-by-december-31",
          ],
        }),
        makeValidated(),
      ),
    ).toEqual({
      valid: false,
      reason: "nested_temporal_basket",
    });
  });

  it("rejects multi-winner qualifier baskets", () => {
    expect(
      evaluateCleanNegRiskBasket(
        makeOpportunity({
          eventSlug: "which-candidates-will-advance-to-brazils-presidential-runoff",
          legSlugs: [
            "will-candidate-one-qualify-for-brazils-presidential-runoff",
            "will-candidate-two-qualify-for-brazils-presidential-runoff",
            "will-candidate-three-qualify-for-brazils-presidential-runoff",
          ],
        }),
        makeValidated(),
      ),
    ).toEqual({
      valid: false,
      reason: "multi_winner_or_qualifier_basket",
    });
  });

  it("rejects clean-looking baskets when the edge is too thin", () => {
    expect(
      evaluateCleanNegRiskBasket(
        makeOpportunity({
          eventSlug: "2026-nhl-stanley-cup-champion",
          legSlugs: [
            "will-the-carolina-hurricanes-win-the-2026-nhl-stanley-cup",
            "will-the-colorado-avalanche-win-the-2026-nhl-stanley-cup",
            "will-the-vegas-golden-knights-win-the-2026-nhl-stanley-cup",
          ],
        }),
        makeValidated({
          edgeBps: 40,
          roiBps: 13.35,
        }),
      ),
    ).toEqual({
      valid: false,
      reason: "insufficient_clean_edge",
    });
  });

  it("rejects baskets with wide leg spreads", () => {
    expect(
      evaluateCleanNegRiskBasket(
        makeOpportunity({
          eventSlug: "2026-nba-champion",
          legSlugs: [
            "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
            "will-the-new-york-knicks-win-the-2026-nba-finals",
            "will-the-oklahoma-city-thunder-win-the-2026-nba-finals",
          ],
        }),
        makeValidated({
          spread: 0.04,
        }),
      ),
    ).toEqual({
      valid: false,
      reason: "wide_leg_spread",
    });
  });

  it("keeps far-future clean baskets as long-duration watch instead of paper-fire candidates", () => {
    expect(
      evaluateCleanNegRiskBasket(
        {
          ...makeOpportunity({
            eventSlug: "2026-nba-champion",
            legSlugs: [
              "will-the-cleveland-cavaliers-win-the-2026-nba-finals",
              "will-the-new-york-knicks-win-the-2026-nba-finals",
              "will-the-oklahoma-city-thunder-win-the-2026-nba-finals",
            ],
          }),
          expectedResolutionAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
        makeValidated(),
      ),
    ).toEqual({
      valid: false,
      reason: "duration_too_long_for_short_arb",
    });
  });
});

function makeOpportunity(input: {
  eventSlug: string;
  legSlugs: string[];
}): NegRiskBracketOpportunity {
  return {
    eventSlug: input.eventSlug,
    sumYes: null,
    threshold: input.legSlugs.length - 1,
    expectedEdge: 0.2,
    expectedResolutionAt: Date.now() + 60 * 60 * 1000,
    reason: "snapshot_no_basket_positive_edge_limited_coverage",
    legs: input.legSlugs.map((slug, index) => ({
      marketId: `market-${index}`,
      slug,
      question: slug.replace(/-/gu, " "),
      yesTokenId: null,
      noTokenId: `no-token-${index}`,
      yesPrice: null,
      sideToPaperTrade: "NO",
    })),
  };
}

function makeValidated(
  overrides: {
    edgeBps?: number;
    maxPositiveBasketCostUsd?: number;
    minLegDepthUsd?: number;
    roiBps?: number;
    spread?: number;
  } = {},
): ValidatedNegRiskOpportunity {
  const spread = overrides.spread ?? 0.01;

  return {
    eventSlug: "2026-nba-champion",
    threshold: 2,
    executableSum: 1.7,
    expectedGrossEdge: 0.3,
    fillableUsd: 1_000,
    minLegDepthUsd: overrides.minLegDepthUsd ?? 500,
    legCount: 3,
    feeAdjustedEdge: 0.3,
    fillable: true,
    valid: true,
    reason: "orderbook_validated",
    legs: [0, 1, 2].map((index) => ({
      marketId: `market-${index}`,
      slug: `team-${index}`,
      question: `Team ${index} wins?`,
      tokenId: `no-token-${index}`,
      sideToPaperTrade: "NO",
      averageFillPrice: 0.5,
      maxFillableUsd: 500,
      bestBid: 0.5 - spread,
      bestAsk: 0.5,
      fillable: true,
      reason: "fillable",
      orderbook: {
        bids: [{ price: 0.5 - spread, size: 10 }],
        asks: [{ price: 0.5, size: 10 }],
      },
    })),
    basketSizing: {
      basketSizeShares: 1,
      basketCostUsd: 1.7,
      basketPayoutUsd: 2,
      basketProfitUsd: 0.3,
      edgePerShare: 0.3,
      edgeBps: overrides.edgeBps ?? 3_000,
      roiBps: overrides.roiBps ?? 1_764.71,
      maxPositiveBasketShares: 1_000,
      maxPositiveBasketCostUsd:
        overrides.maxPositiveBasketCostUsd ?? 10_000,
      maxPositiveBasketPayoutUsd: 20_000,
      maxPositiveBasketProfitUsd: 3_000,
      legs: [0, 1, 2].map((index) => ({
        tokenId: `no-token-${index}`,
        slug: `team-${index}`,
        shares: 1,
        averageFillPrice: 0.5,
        costUsd: 0.5,
      })),
    },
  };
}
