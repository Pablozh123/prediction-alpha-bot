import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listRecentOpportunities } from "../src/execution/opportunityJournal.js";
import { listOpportunityLegs } from "../src/execution/opportunityLegJournal.js";
import { listRecentPaperTrades } from "../src/execution/tradeJournal.js";
import type { CrossVenuePair } from "../src/scanner/crossVenueArbScanner.js";
import { runCrossVenueCycle } from "../src/scanner/crossVenueCycle.js";
import type { CrossVenueDiscoveryResult } from "../src/scanner/crossVenueMatcher.js";

const testDbPath = join("logs", "cross-venue-cycle-test.db");
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

describe("cross-venue cycle", () => {
  beforeEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
    initDb(testDbPath);
  });

  afterEach(() => {
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("journals validated, no-edge, rejected and mismatch outcomes and never paper-fires", async () => {
    const discovery: CrossVenueDiscoveryResult = {
      pairs: [{ ...makePair("discovered"), matchScore: 0.8, matchReason: "shared=x" }],
      kalshiMarketCount: 10,
      polymarketMarketCount: 10,
      candidatePreview: [
        {
          kalshiTicker: "KXMULTI",
          kalshiTitle: "Yes A, Yes B, Yes C",
          kalshiSubtitle: "",
          polymarketSlug: "single-outcome",
          polymarketQuestion: "Will A happen?",
          yesTokenId: "y",
          noTokenId: "n",
          outcomeLabel: "YES",
          matchScore: 0.7,
          matchReason: "shared=a",
          status: "compound_kalshi_market",
        },
        {
          kalshiTicker: "KXOK",
          kalshiTitle: "Will B happen?",
          kalshiSubtitle: "",
          polymarketSlug: "b-happens",
          polymarketQuestion: "Will B happen?",
          yesTokenId: "y",
          noTokenId: "n",
          outcomeLabel: "YES",
          matchScore: 0.9,
          matchReason: "shared=b",
          status: "candidate",
        },
      ],
    };
    const scanPairs = vi.fn(async (pairs: CrossVenuePair[]) => ({
      opportunities: [
        {
          pairId: pairs[0]!.id,
          title: pairs[0]!.title,
          outcomeLabel: "YES",
          slug: pairs[0]!.polymarket.slug,
          buyYesVenue: "kalshi" as const,
          buyNoVenue: "polymarket" as const,
          grossCents: 4.6,
          feeCents: 1.53,
          netCents: 3.07,
          roiBps: 321.8,
          totalTopOfBookCost: 0.954,
          executableSize: 100,
          maxProfitDollars: 2.9,
          category: "politics",
          expectedResolutionAt: NOW + 830 * 86_400_000,
          reason: "cross_venue_yes_no_below_one" as const,
          feeModel: "curve" as const,
          feeModelVersion: "2026-07-30",
          roleMode: "taker" as const,
          capitalUsd: 95.4,
          grossEdgeBps: 482.18,
          executableNetEdgeBps: 303.98,
          daysToResolution: 830,
          annualizedPct: 1.34,
          ruleMatch: "unverified" as const,
          yesLeg: {
            venue: "kalshi" as const,
            side: "YES" as const,
            identifier: pairs[0]!.kalshi.ticker,
            bestAsk: 0.42,
            averageFillPrice: 0.42,
            role: "taker" as const,
            sizeUsd: 42,
            feeUsd: 1.71,
          },
          noLeg: {
            venue: "polymarket" as const,
            side: "NO" as const,
            identifier: pairs[0]!.polymarket.slug,
            bestAsk: 0.534,
            averageFillPrice: 0.534,
            role: "taker" as const,
            sizeUsd: 53.4,
            feeUsd: 0.99,
          },
        },
      ],
      priceSpreads: [],
      rejected: [
        {
          pairId: "mismatch-pair",
          reason: "question_type_mismatch",
          detail: "different question types: result against margin",
        },
      ],
      noEdge: [
        {
          pairId: "no-edge-pair",
          reason: "non_positive_net_edge_after_fees" as const,
          grossCents: 1.2,
          netCents: -0.4,
        },
      ],
      orderbookReads: {
        kalshi: emptyStats(),
        polymarket: emptyStats(),
        total: emptyStats(),
      },
    }));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await runCrossVenueCycle({
      autoDiscover: true,
      discover: async () => discovery,
      scanPairs,
      logger,
      now: () => NOW,
      pairsPath: join("tests", "does-not-exist.json"),
    });

    // only the discovered pair exists here; the test scan result names two more
    // pair ids that the cycle must still journal by id.
    expect(result).toEqual({
      success: true,
      pairsScanned: 1,
      opportunities: 1,
      noEdge: 1,
      rejectedPairs: 1,
      mismatchCandidates: 1,
    });
    expect(scanPairs).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "discovered" })],
      expect.objectContaining({ nowMs: NOW }),
    );

    const journaled = listRecentOpportunities(10);

    expect(journaled).toHaveLength(4);
    expect(journaled.map((row) => [row.status, row.reason, row.ruleMatch])).toEqual(
      expect.arrayContaining([
        ["validated", "cross_venue_yes_no_below_one", "unverified"],
        ["rejected", "non_positive_net_edge_after_fees", "unverified"],
        ["rejected", "question_type_mismatch", "mismatch"],
        ["rejected", "compound_kalshi_market", "mismatch"],
      ]),
    );

    const validated = journaled.find((row) => row.status === "validated");

    expect(validated).toMatchObject({
      strategy: "cross_venue_yes_no_arb",
      venues: ["kalshi", "polymarket"],
      netEdgeBps: 303.98,
      grossEdgeBps: 482.18,
      capitalUsd: 95.4,
      daysToResolution: 830,
      annualizedPct: 1.34,
      feeUsd: 2.7,
    });
    expect(listOpportunityLegs(validated!.id)).toEqual([
      expect.objectContaining({ venue: "kalshi", side: "YES", role: "taker", feeUsd: 1.71 }),
      expect.objectContaining({ venue: "polymarket", side: "NO", role: "taker", feeUsd: 0.99 }),
    ]);
    expect(listRecentPaperTrades(10)).toEqual([]);
  });

  it("reads configured pairs with their titles and drops disabled ones", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cross-venue-pairs-"));
    const pairsPath = join(dir, "pairs.json");

    writeFileSync(
      pairsPath,
      JSON.stringify({
        feesCents: { kalshi: 0, polymarket: 0 },
        minNetCents: 0.75,
        pairs: [
          {
            id: "configured",
            title: "Configured pair",
            outcomeLabel: "YES",
            kalshi: { ticker: "KXCONF", title: "Will C happen?" },
            polymarket: {
              slug: "c-happens",
              question: "Will C happen?",
              yesTokenId: "y",
              noTokenId: "n",
            },
          },
          {
            id: "paused",
            title: "Paused pair",
            outcomeLabel: "YES",
            enabled: false,
            kalshi: { ticker: "KXPAUSED" },
            polymarket: { slug: "paused", yesTokenId: "y", noTokenId: "n" },
          },
        ],
      }),
    );
    const scanPairs = vi.fn(async () => ({
      opportunities: [],
      priceSpreads: [],
      rejected: [],
      noEdge: [],
      orderbookReads: { kalshi: emptyStats(), polymarket: emptyStats(), total: emptyStats() },
    }));

    try {
      const result = await runCrossVenueCycle({ pairsPath, scanPairs, now: () => NOW });

      expect(result).toMatchObject({ success: true, pairsScanned: 1 });
      expect(scanPairs).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: "configured",
            kalshi: expect.objectContaining({ title: "Will C happen?" }),
            polymarket: expect.objectContaining({ question: "Will C happen?" }),
          }),
        ],
        expect.objectContaining({
          minNetCents: 0.75,
          feesCents: { kalshi: 0, polymarket: 0 },
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records a scanner error instead of throwing", async () => {
    const result = await runCrossVenueCycle({
      autoDiscover: true,
      discover: async () => {
        throw new Error("Kalshi unavailable");
      },
      now: () => NOW,
    });

    expect(result).toMatchObject({ success: false, error: "Kalshi unavailable" });
  });

  it("contains no live order integration", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/scanner/crossVenueCycle.ts", "utf8");

    expect(source).not.toContain("executeOrPaper");
    expect(source).not.toContain("placeOrder");
    expect(source).not.toContain("@polymarket/clob-client");
  });
});

function makePair(id: string): CrossVenuePair {
  return {
    id,
    title: `Pair ${id}`,
    outcomeLabel: "YES",
    kalshi: { ticker: `KX-${id}` },
    polymarket: { slug: `poly-${id}`, yesTokenId: "yes", noTokenId: "no" },
  };
}

function emptyStats() {
  return {
    reads: 0,
    dedupedReads: 0,
    cacheHits: 0,
    liveWatchedHits: 0,
    websocketHits: 0,
    restHits: 0,
    missingCacheMisses: 0,
    staleCacheMisses: 0,
    cacheUnavailable: 0,
    restFetches: 0,
    restWrites: 0,
  };
}
