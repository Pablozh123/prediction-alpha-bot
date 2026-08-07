import { describe, expect, it } from "vitest";
import {
  buildCrossVenueReportData,
  renderCrossVenueDashboardHtml,
} from "../src/scripts/crossVenueArbScan.js";

describe("cross venue dashboard report", () => {
  it("renders a local filterable paper-only dashboard", () => {
    const data = buildCrossVenueReportData({
      autoDiscover: true,
      configPath: "config/crossVenuePairs.json",
      dryRun: true,
      feesCents: { kalshi: 0, polymarket: 0 },
      minNetCents: 0.5,
      reportDate: "2026-06-02",
      discoveryResult: {
        kalshiMarketCount: 10,
        polymarketMarketCount: 20,
        pairs: [],
        candidatePreview: [
          {
            kalshiTicker: "KXTEST",
            kalshiTitle: "Will test happen?",
            kalshiSubtitle: "Test market",
            polymarketSlug: "will-test-happen",
            polymarketQuestion: "Will test happen?",
            yesTokenId: "yes-token",
            noTokenId: "no-token",
            outcomeLabel: "YES",
            expectedResolutionAt: Date.UTC(2026, 5, 30),
            matchScore: 0.81,
            matchReason: "shared=test,happen",
            status: "candidate",
          },
        ],
      },
      pairs: [
        {
          id: "KXTEST|will-test-happen",
          title: "Will test happen?",
          outcomeLabel: "YES",
          kalshi: { ticker: "KXTEST" },
          polymarket: {
            slug: "will-test-happen",
            yesTokenId: "yes-token",
            noTokenId: "no-token",
          },
          matchScore: 0.81,
          matchReason: "shared=test,happen",
        },
      ],
      opportunities: [
        {
          pairId: "KXTEST|will-test-happen",
          title: "Will test happen?",
          outcomeLabel: "YES",
          slug: "will-test-happen",
          buyYesVenue: "kalshi",
          buyNoVenue: "polymarket",
          grossCents: 3,
          feeCents: 0,
          netCents: 3,
          roiBps: 309.28,
          totalTopOfBookCost: 0.97,
          executableSize: 10,
          maxProfitDollars: 0.3,
          reason: "cross_venue_yes_no_below_one",
          yesLeg: {
            venue: "kalshi",
            side: "YES",
            identifier: "KXTEST",
            bestAsk: 0.42,
            averageFillPrice: 0.42,
          },
          noLeg: {
            venue: "polymarket",
            side: "NO",
            identifier: "will-test-happen",
            bestAsk: 0.55,
            averageFillPrice: 0.55,
          },
        },
      ],
      priceSpreads: [],
      rejectedPairs: [],
    });

    const html = renderCrossVenueDashboardHtml(data);

    expect(html).toContain("Cross-Venue Arb Dashboard");
    expect(html).toContain("data-filter=\"arb\"");
    expect(html).toContain("KXTEST");
    expect(html).toContain("will-test-happen");
    expect(html).toContain("paper-only");
    expect(html).not.toContain("@polymarket/clob-client");
    expect(html).not.toMatch(/placeOrder|postOrder|buyLimit|sellPosition/);
    expect(html).not.toMatch(/private[_-]?key|seed phrase/i);
  });
});
