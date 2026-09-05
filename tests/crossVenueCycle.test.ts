import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, initDb } from "../src/execution/db.js";
import { listCrossVenuePairsSince } from "../src/execution/crossVenuePairJournal.js";
import { listRecentOpportunities } from "../src/execution/opportunityJournal.js";
import { listOpportunityLegs } from "../src/execution/opportunityLegJournal.js";
import { listRecentPaperTrades } from "../src/execution/tradeJournal.js";
import type {
  CrossVenueArbOpportunity,
  CrossVenuePair,
} from "../src/scanner/crossVenueArbScanner.js";
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
      // 1.34 percent a year clears a one-percent hurdle; the default of ten
      // would reject the pair at gate 4, which the next test covers.
      hurdlePct: 1,
      pairsPath: join("tests", "does-not-exist.json"),
    });

    // only the discovered pair exists here; the test scan result names two more
    // pair ids that the cycle must still journal by id.
    expect(result).toEqual({
      success: true,
      pairsScanned: 1,
      opportunities: 0,
      candidates: 1,
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
    expect(
      journaled.map((row) => [row.status, row.reason, row.ruleScreen, row.ruleReview, row.ruleMatch]),
    ).toEqual(
      expect.arrayContaining([
        // nobody has read the rulebooks: a candidate, never a chance
        ["candidate", "cross_venue_candidate", "passed", "none", "unverified"],
        ["rejected", "non_positive_net_edge_after_fees", "passed", "none", "unverified"],
        ["rejected", "question_type_mismatch", "different_question", "none", "mismatch"],
        ["rejected", "compound_kalshi_market", "compound_market", "none", "mismatch"],
      ]),
    );

    const candidate = journaled.find((row) => row.status === "candidate");

    expect(candidate).toMatchObject({
      strategy: "cross_venue_yes_no_arb",
      venues: ["kalshi", "polymarket"],
      netEdgeBps: 303.98,
      grossEdgeBps: 482.18,
      capitalUsd: 95.4,
      daysToResolution: 830,
      annualizedPct: 1.34,
      feeUsd: 2.7,
      netProfitUsd: 2.9,
      gateFailed: null,
    });
    expect(listOpportunityLegs(candidate!.id)).toEqual([
      expect.objectContaining({ venue: "kalshi", side: "YES", role: "taker", feeUsd: 1.71 }),
      expect.objectContaining({ venue: "polymarket", side: "NO", role: "taker", feeUsd: 0.99 }),
    ]);
    expect(listRecentPaperTrades(10)).toEqual([]);

    // the pair board carries every pair the lane looked at, mismatches included
    const board = listCrossVenuePairsSince(0, 10);

    expect(board.map((pair) => [pair.pairId, pair.source, pair.ruleScreen, pair.ruleReview])).toEqual(
      expect.arrayContaining([
        ["discovered", "discovery", "passed", "none"],
        ["KXMULTI|single-outcome", "discovery", "compound_market", "none"],
      ]),
    );
    expect(board.find((pair) => pair.pairId === "discovered")).toMatchObject({
      lastNetCents: 3.07,
      lastAnnualizedPct: 1.34,
      lastStatus: "candidate",
    });
  });

  it("rejects a positive pair below the hurdle at gate 4, with its numbers kept", async () => {
    const scanPairs = vi.fn(async (pairs: CrossVenuePair[]) => ({
      opportunities: [makeOpportunity(pairs[0]!, { annualizedPct: 1.34 })],
      priceSpreads: [],
      rejected: [],
      noEdge: [],
      orderbookReads: { kalshi: emptyStats(), polymarket: emptyStats(), total: emptyStats() },
    }));
    const dir = mkdtempSync(join(tmpdir(), "cross-venue-hurdle-"));
    const pairsPath = join(dir, "pairs.json");

    writeFileSync(pairsPath, JSON.stringify({ pairs: [makePair("carry")] }));

    try {
      const result = await runCrossVenueCycle({ pairsPath, scanPairs, now: () => NOW });

      expect(result).toMatchObject({ opportunities: 0, candidates: 0 });
      expect(listRecentOpportunities(10)[0]).toMatchObject({
        status: "rejected",
        reason: "below_annualized_hurdle",
        gateFailed: 4,
        annualizedPct: 1.34,
        netEdgeBps: 303.98,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets only a person's review turn a positive pair into a validated chance", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cross-venue-review-"));
    const pairsPath = join(dir, "pairs.json");

    writeFileSync(
      pairsPath,
      JSON.stringify({
        pairs: [
          {
            ...makePair("equivalent"),
            review: { verdict: "equivalent", date: "2026-09-08", reviewer: "cc", note: "same source, same deadline" },
          },
          {
            ...makePair("different"),
            review: { verdict: "not_equivalent", date: "2026-07-31", note: "inaugurated against wins" },
          },
          { ...makePair("legacy"), verified: true },
        ],
      }),
    );
    const scanPairs = vi.fn(async (pairs: CrossVenuePair[]) => ({
      opportunities: pairs.map((pair) => makeOpportunity(pair, { annualizedPct: 19 })),
      priceSpreads: [],
      rejected: [],
      noEdge: [],
      orderbookReads: { kalshi: emptyStats(), polymarket: emptyStats(), total: emptyStats() },
    }));

    try {
      const result = await runCrossVenueCycle({ pairsPath, scanPairs, now: () => NOW });

      expect(result).toMatchObject({ pairsScanned: 3, opportunities: 1, candidates: 1 });

      const rows = listRecentOpportunities(10);
      const byPair = (id: string) =>
        rows.find((row) => row.slug === `poly-${id}`) ?? rows.find((row) => row.title === `Pair ${id}`);

      expect(byPair("equivalent")).toMatchObject({
        status: "validated",
        ruleScreen: "passed",
        ruleReview: "equivalent",
        ruleMatch: "reviewed",
      });
      // a person said the rulebooks differ: gate 1, and no return figures
      expect(byPair("different")).toMatchObject({
        status: "rejected",
        reason: "rule_review_not_equivalent",
        gateFailed: 1,
        ruleReview: "not_equivalent",
        ruleMatch: "mismatch",
        netEdgeBps: null,
        annualizedPct: null,
      });
      // the old verified flag came from the discovery review, not from a rules review
      expect(byPair("legacy")).toMatchObject({
        status: "candidate",
        ruleReview: "pending",
        ruleMatch: "unverified",
      });
      expect(listRecentPaperTrades(10)).toEqual([]);
      // a pair a person rejected never reaches the books: no numbers on its row
      expect(scanPairs.mock.calls[0]?.[0].map((pair) => pair.id)).toEqual(["equivalent", "legacy"]);
      expect(listCrossVenuePairsSince(0, 10).find((pair) => pair.pairId === "different")).toMatchObject({
        ruleReview: "not_equivalent",
        review: expect.objectContaining({ verdict: "not_equivalent", note: "inaugurated against wins" }),
        lastNetCents: null,
        lastStatus: "rejected",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("screens configured pairs on titles and dates before any book is read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cross-venue-screen-"));
    const pairsPath = join(dir, "pairs.json");

    writeFileSync(
      pairsPath,
      JSON.stringify({
        pairs: [
          {
            ...makePair("months-apart"),
            kalshi: { ticker: "KXFED-DEC", title: "Will the Fed cut rates at the December 2026 meeting?", expectedResolutionAt: "2026-12-10T18:00:00Z" },
            polymarket: { slug: "fed-sep", question: "Will the Fed cut rates at the September 2026 meeting?", yesTokenId: "y", noTokenId: "n", expectedResolutionAt: "2026-09-17T18:00:00Z" },
          },
          {
            ...makePair("inverted"),
            kalshi: { ticker: "KXBTC-B", title: "Will Bitcoin be below $120,000 on December 31, 2026?" },
            polymarket: { slug: "btc-above", question: "Will Bitcoin be above $120,000 on December 31, 2026?", yesTokenId: "y", noTokenId: "n" },
          },
          {
            ...makePair("reviewed-despite-dates"),
            kalshi: { ticker: "KXPRES", title: "Who will win the next presidential election? Marco Rubio", expectedResolutionAt: "2029-01-21T15:00:00Z" },
            polymarket: { slug: "rubio-2028", question: "Will Marco Rubio win the 2028 US Presidential Election?", yesTokenId: "y", noTokenId: "n", expectedResolutionAt: "2028-11-07T00:00:00Z" },
            review: { verdict: "equivalent", date: "2026-09-08", note: "test double" },
          },
          {
            ...makePair("clean"),
            kalshi: { ticker: "KXSOM", title: "Will Trump recognize Somaliland? Before 2027", expectedResolutionAt: "2027-01-01T15:00:00Z" },
            polymarket: { slug: "somaliland", question: "Will Trump recognize Somaliland before 2027?", yesTokenId: "y", noTokenId: "n", expectedResolutionAt: "2027-01-01T04:59:00Z" },
          },
        ],
      }),
    );
    const scanPairs = vi.fn(async (pairs: CrossVenuePair[]) => ({
      opportunities: pairs.map((pair) => makeOpportunity(pair, { annualizedPct: 19 })),
      priceSpreads: [],
      rejected: [],
      noEdge: [],
      orderbookReads: { kalshi: emptyStats(), polymarket: emptyStats(), total: emptyStats() },
    }));

    try {
      const result = await runCrossVenueCycle({ pairsPath, scanPairs, now: () => NOW });

      // only the pairs that passed the screen, or carry a person's equivalent verdict, reach the books
      expect(scanPairs.mock.calls[0]?.[0].map((pair) => pair.id)).toEqual(["reviewed-despite-dates", "clean"]);
      expect(result).toMatchObject({ pairsScanned: 4, opportunities: 1, candidates: 1 });

      const rows = listRecentOpportunities(10);
      const byTitle = (title: string) => rows.find((row) => row.title === title);

      expect(byTitle("Pair months-apart")).toMatchObject({
        status: "rejected",
        reason: "resolution_time_mismatch",
        gateFailed: 1,
        ruleScreen: "resolution_time_mismatch",
        netEdgeBps: null,
      });
      expect(byTitle("Pair inverted")).toMatchObject({
        status: "rejected",
        reason: "question_inverted",
        ruleScreen: "inverted",
      });
      expect(listCrossVenuePairsSince(0, 10).find((pair) => pair.pairId === "months-apart")).toMatchObject({
        ruleScreen: "resolution_time_mismatch",
        ruleScreenDetail: "resolution dates 84 days apart",
        lastStatus: "rejected",
      });
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

function makeOpportunity(
  pair: CrossVenuePair,
  overrides: { annualizedPct: number },
): CrossVenueArbOpportunity {
  return {
    pairId: pair.id,
    title: pair.title,
    outcomeLabel: "YES",
    slug: pair.polymarket.slug,
    buyYesVenue: "kalshi",
    buyNoVenue: "polymarket",
    grossCents: 4.6,
    feeCents: 1.53,
    netCents: 3.07,
    roiBps: 321.8,
    totalTopOfBookCost: 0.954,
    executableSize: 100,
    maxProfitDollars: 2.9,
    category: "politics",
    expectedResolutionAt: NOW + 830 * 86_400_000,
    reason: "cross_venue_yes_no_below_one",
    feeModel: "curve",
    feeModelVersion: "2026-07-30",
    roleMode: "taker",
    capitalUsd: 95.4,
    grossEdgeBps: 482.18,
    executableNetEdgeBps: 303.98,
    daysToResolution: 830,
    annualizedPct: overrides.annualizedPct,
    ruleMatch: "unverified",
    yesLeg: {
      venue: "kalshi",
      side: "YES",
      identifier: pair.kalshi.ticker,
      bestAsk: 0.42,
      averageFillPrice: 0.42,
      role: "taker",
      sizeUsd: 42,
      feeUsd: 1.71,
    },
    noLeg: {
      venue: "polymarket",
      side: "NO",
      identifier: pair.polymarket.slug,
      bestAsk: 0.534,
      averageFillPrice: 0.534,
      role: "taker",
      sizeUsd: 53.4,
      feeUsd: 0.99,
    },
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
