import { describe, expect, it } from "vitest";
import {
  classifyNegRiskOpportunityRecord,
  classifyNegRiskPayoffStructure,
} from "../src/scanner/negRiskBasketClassifier.js";

const nowMs = Date.parse("2026-05-29T12:00:00.000Z");

describe("NEG_RISK basket classifier", () => {
  it("classifies clean short one-winner baskets as clean arbs", () => {
    expect(
      classifyNegRiskOpportunityRecord({
        eventSlug: "2026-nba-champion",
        expectedResolutionAt: nowMs + 2 * 60 * 60 * 1000,
        legs: [
          {
            question: "Will the Knicks win the 2026 NBA Finals?",
            slug: "will-the-knicks-win-the-2026-nba-finals",
          },
          {
            question: "Will the Thunder win the 2026 NBA Finals?",
            slug: "will-the-thunder-win-the-2026-nba-finals",
          },
        ],
        nowMs,
      }).basketClass,
    ).toBe("clean_arb");
  });

  it("classifies clean-looking long-duration baskets as duration risk", () => {
    expect(
      classifyNegRiskOpportunityRecord({
        eventSlug: "2026-nhl-stanley-cup-champion",
        expectedResolutionAt: nowMs + 120 * 24 * 60 * 60 * 1000,
        legs: [
          {
            question: "Will Carolina win the Stanley Cup?",
            slug: "will-carolina-win-the-stanley-cup",
          },
          {
            question: "Will Colorado win the Stanley Cup?",
            slug: "will-colorado-win-the-stanley-cup",
          },
        ],
        nowMs,
      }).basketClass,
    ).toBe("duration_risk");
  });

  it("classifies nested date baskets as directional buckets", () => {
    expect(
      classifyNegRiskPayoffStructure({
        eventSlug: "what-will-happen-before-gta-vi",
        legs: [
          {
            question: "Will Bitcoin hit $1m before GTA VI?",
            slug: "will-bitcoin-hit-1m-before-gta-vi",
          },
          {
            question: "Will Tesla hit $2T before GTA VI?",
            slug: "will-tesla-hit-2t-before-gta-vi",
          },
        ],
      }),
    ).toBe("nested_temporal_basket");
  });

  it("classifies qualifier baskets as directional buckets", () => {
    expect(
      classifyNegRiskOpportunityRecord({
        eventSlug: "which-candidates-will-advance-to-brazils-presidential-runoff",
        expectedResolutionAt: nowMs + 2 * 60 * 60 * 1000,
        legs: [
          {
            question: "Will Candidate A qualify for the runoff?",
            slug: "will-candidate-a-qualify-for-runoff",
          },
          {
            question: "Will Candidate B qualify for the runoff?",
            slug: "will-candidate-b-qualify-for-runoff",
          },
        ],
        nowMs,
      }).basketClass,
    ).toBe("directional_bucket");
  });

  it("classifies explicit bucket markets as clean payoff structures", () => {
    expect(
      classifyNegRiskPayoffStructure({
        eventSlug: "databricks-ipo-closing-market-cap",
        legs: [
          {
            question: "Will Databricks IPO closing market cap be under $50B?",
            slug: "databricks-ipo-closing-market-cap-under-50b",
          },
          {
            question: "Will Databricks IPO closing market cap be between $50B and $100B?",
            slug: "databricks-ipo-closing-market-cap-between-50b-and-100b",
          },
          {
            question: "Will Databricks IPO closing market cap be over $100B?",
            slug: "databricks-ipo-closing-market-cap-over-100b",
          },
        ],
      }),
    ).toBe("clean");
  });
});
