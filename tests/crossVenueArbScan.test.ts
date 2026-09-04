import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readCrossVenueLiveFeed,
  runCrossVenueArbScan,
  type CrossVenueReportData,
} from "../src/scripts/crossVenueArbScan.js";
import type {
  CrossVenueArbOpportunity,
  CrossVenuePair,
  CrossVenueScanResult,
} from "../src/scanner/crossVenueArbScanner.js";
import { emptyCrossVenueOrderbookReadMetrics } from "../src/scanner/crossVenueArbScanner.js";
import type { CrossVenueMatchedPair } from "../src/scanner/crossVenueMatcher.js";

describe("cross venue arb scan runner", () => {
  it("combines configured pairs with explicit auto-discovery pairs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crossvenue-runner-"));
    const pairsPath = join(dir, "crossVenuePairs.json");
    const dbPath = join(dir, "scan.db");
    const liveFeedPath = join(dir, "cross-venue-live-feed.json");
    const scannedPairIds: string[] = [];

    writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          pairs: [makeConfiguredPair()],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCrossVenueArbScan({
      autoDiscover: true,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      discoverPairsWithDiagnostics: async () => ({
        kalshiMarketCount: 1,
        polymarketMarketCount: 1,
        pairs: [makeDiscoveredPair()],
        candidatePreview: [],
      }),
      scanPairs: async (pairs): Promise<CrossVenueScanResult> => {
        scannedPairIds.push(...pairs.map((pair) => pair.id));

        return {
          opportunities: [],
          orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
          priceSpreads: [],
          rejected: [],
        noEdge: [],
        };
      },
    });
    const report = JSON.parse(
      readFileSync(result.jsonPath, "utf8"),
    ) as CrossVenueReportData;

    expect(scannedPairIds).toEqual([
      "KXCONFIG|poly-config",
      "KXDISCOVERED|poly-discovered",
    ]);
    expect(report.autoDiscover).toBe(true);
    expect(report.summary.pairsScanned).toBe(2);
    expect(report.discoveryResult?.pairs).toHaveLength(1);
  });

  it("skips disabled configured pairs and suppresses same-id discovery pairs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crossvenue-runner-disabled-"));
    const pairsPath = join(dir, "crossVenuePairs.json");
    const dbPath = join(dir, "scan.db");
    const liveFeedPath = join(dir, "cross-venue-live-feed.json");
    const activePair = makeConfiguredPair();
    const disabledPair: CrossVenuePair = {
      ...makeConfiguredPair(),
      id: "KXDISABLED|poly-disabled",
      title: "Disabled pair",
      enabled: false,
      kalshi: { ticker: "KXDISABLED" },
      polymarket: {
        slug: "poly-disabled",
        yesTokenId: "yes-disabled",
        noTokenId: "no-disabled",
      },
    };
    const scannedPairIds: string[] = [];

    writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          pairs: [activePair, disabledPair],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCrossVenueArbScan({
      autoDiscover: true,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      discoverPairsWithDiagnostics: async () => ({
        kalshiMarketCount: 1,
        polymarketMarketCount: 1,
        pairs: [
          {
            ...makeDiscoveredPair(),
            id: disabledPair.id,
            title: disabledPair.title,
            kalshi: disabledPair.kalshi,
            polymarket: disabledPair.polymarket,
          },
        ],
        candidatePreview: [],
      }),
      scanPairs: async (pairs): Promise<CrossVenueScanResult> => {
        scannedPairIds.push(...pairs.map((pair) => pair.id));

        return {
          opportunities: [],
          orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
          priceSpreads: [],
          rejected: [],
        noEdge: [],
        };
      },
    });
    const report = JSON.parse(
      readFileSync(result.jsonPath, "utf8"),
    ) as CrossVenueReportData;

    expect(scannedPairIds).toEqual(["KXCONFIG|poly-config"]);
    expect(report.summary.pairsScanned).toBe(1);
    expect(JSON.stringify(report.pairs)).not.toContain(disabledPair.id);
  });

  it("can scan an explicit in-memory pair list instead of the config file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crossvenue-runner-explicit-"));
    const pairsPath = join(dir, "crossVenuePairs.json");
    const dbPath = join(dir, "scan.db");
    const liveFeedPath = join(dir, "cross-venue-live-feed.json");
    const explicitPair: CrossVenuePair = {
      ...makeConfiguredPair(),
      id: "KXEXPLICIT|poly-explicit",
      title: "Explicit pair",
      kalshi: { ticker: "KXEXPLICIT" },
      polymarket: {
        slug: "poly-explicit",
        yesTokenId: "yes-explicit",
        noTokenId: "no-explicit",
      },
    };
    const scannedPairIds: string[] = [];

    writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          pairs: [makeConfiguredPair()],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCrossVenueArbScan({
      autoDiscover: false,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairs: [explicitPair],
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      scanPairs: async (pairs): Promise<CrossVenueScanResult> => {
        scannedPairIds.push(...pairs.map((pair) => pair.id));

        return {
          opportunities: [],
          orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
          priceSpreads: [],
          rejected: [],
        noEdge: [],
        };
      },
    });
    const report = JSON.parse(
      readFileSync(result.jsonPath, "utf8"),
    ) as CrossVenueReportData;

    expect(scannedPairIds).toEqual(["KXEXPLICIT|poly-explicit"]);
    expect(report.summary.pairsScanned).toBe(1);
    expect(report.pairs[0]?.id).toBe("KXEXPLICIT|poly-explicit");
  });

  it("persists a live feed and marks disappeared opportunities inactive", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crossvenue-runner-live-feed-"));
    const pairsPath = join(dir, "crossVenuePairs.json");
    const dbPath = join(dir, "scan.db");
    const liveFeedPath = join(dir, "cross-venue-live-feed.json");
    let scanCount = 0;

    writeFileSync(
      pairsPath,
      JSON.stringify(
        {
          pairs: [makeConfiguredPair()],
        },
        null,
        2,
      ),
      "utf8",
    );

    const scanPairs = async (): Promise<CrossVenueScanResult> => {
      scanCount += 1;

      return {
        opportunities: scanCount === 1 ? [makeOpportunity()] : [],
        orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
        priceSpreads: [],
        rejected: [],
        noEdge: [],
      };
    };

    const first = await runCrossVenueArbScan({
      autoDiscover: false,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      scanPairs,
    });
    const firstFeed = readCrossVenueLiveFeed(first.liveFeedPath);

    expect(first.liveFeedPath).toBe(liveFeedPath);
    expect(firstFeed.summary.activeOpportunities).toBe(1);
    expect(firstFeed.entries[0]).toMatchObject({
      active: true,
      kind: "opportunity",
      pairId: "KXCONFIG|poly-config",
      seenCount: 1,
    });

    await runCrossVenueArbScan({
      autoDiscover: false,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      scanPairs,
    });
    const secondFeed = readCrossVenueLiveFeed(liveFeedPath);

    expect(secondFeed.summary.activeOpportunities).toBe(0);
    expect(secondFeed.summary.inactiveEntries).toBe(1);
    expect(secondFeed.entries[0]).toMatchObject({
      active: false,
      kind: "opportunity",
      pairId: "KXCONFIG|poly-config",
      seenCount: 1,
    });
    expect(secondFeed.entries[0]?.inactiveSinceAt).toBeDefined();
    expect(secondFeed.entries[0]?.lastOpportunity?.netCents).toBe(3.1);
  });

  it("keeps the same live opportunity entry when only the local pair id changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crossvenue-runner-live-feed-id-"));
    const pairsPath = join(dir, "crossVenuePairs.json");
    const dbPath = join(dir, "scan.db");
    const liveFeedPath = join(dir, "cross-venue-live-feed.json");
    const scanPairs = async (pairs: CrossVenuePair[]): Promise<CrossVenueScanResult> => {
      const pair = pairs[0] ?? makeConfiguredPair();

      return {
        opportunities: [
          makeOpportunity({
            pairId: pair.id,
            title: pair.title,
          }),
        ],
        orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
        priceSpreads: [],
        rejected: [],
        noEdge: [],
      };
    };
    const writePair = (pair: CrossVenuePair) =>
      writeFileSync(
        pairsPath,
        JSON.stringify({ pairs: [pair] }, null, 2),
        "utf8",
      );

    writePair(makeConfiguredPair());
    await runCrossVenueArbScan({
      autoDiscover: false,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      scanPairs,
    });

    writePair({
      ...makeConfiguredPair(),
      id: "manual-same-market",
      title: "Manual same market",
    });
    await runCrossVenueArbScan({
      autoDiscover: false,
      dbPath,
      dryRun: true,
      liveFeedPath,
      pairsPath,
      quiet: true,
      reportDate: "2026-06-02",
      scanPairs,
    });
    const feed = readCrossVenueLiveFeed(liveFeedPath);

    expect(feed.summary.activeOpportunities).toBe(1);
    expect(feed.summary.totalEntries).toBe(1);
    expect(feed.entries[0]).toMatchObject({
      active: true,
      kind: "opportunity",
      pairId: "manual-same-market",
      seenCount: 2,
    });
  });
});

function makeConfiguredPair(): CrossVenuePair {
  return {
    id: "KXCONFIG|poly-config",
    title: "Configured pair",
    outcomeLabel: "YES",
    expectedResolutionAt: Date.UTC(2026, 5, 30),
    kalshi: {
      ticker: "KXCONFIG",
    },
    polymarket: {
      slug: "poly-config",
      yesTokenId: "yes-config",
      noTokenId: "no-config",
    },
  };
}

function makeDiscoveredPair(): CrossVenueMatchedPair {
  return {
    id: "KXDISCOVERED|poly-discovered",
    title: "Discovered pair",
    outcomeLabel: "YES",
    expectedResolutionAt: Date.UTC(2026, 5, 30),
    kalshi: {
      ticker: "KXDISCOVERED",
    },
    polymarket: {
      slug: "poly-discovered",
      yesTokenId: "yes-discovered",
      noTokenId: "no-discovered",
    },
    matchScore: 0.9,
    matchReason: "shared=discovered,pair",
  };
}

function makeOpportunity(
  overrides: Partial<CrossVenueArbOpportunity> = {},
): CrossVenueArbOpportunity {
  return {
    pairId: "KXCONFIG|poly-config",
    title: "Configured pair",
    outcomeLabel: "YES",
    slug: "poly-config",
    buyYesVenue: "kalshi",
    buyNoVenue: "polymarket",
    grossCents: 3.1,
    feeCents: 0,
    netCents: 3.1,
    roiBps: 319.59,
    totalTopOfBookCost: 0.97,
    executableSize: 10,
    maxProfitDollars: 0.31,
    reason: "cross_venue_yes_no_below_one",
    feeModel: "flat",
    feeModelVersion: "flat",
    roleMode: "taker",
    capitalUsd: 9.7,
    grossEdgeBps: 319.59,
    executableNetEdgeBps: 319.59,
    daysToResolution: null,
    annualizedPct: null,
    ruleMatch: "unverified",
    yesLeg: {
      venue: "kalshi",
      side: "YES",
      identifier: "KXCONFIG",
      bestAsk: 0.47,
      averageFillPrice: 0.47,
      role: "taker",
      sizeUsd: 0,
      feeUsd: 0,
    },
    noLeg: {
      venue: "polymarket",
      side: "NO",
      identifier: "no-config",
      bestAsk: 0.5,
      averageFillPrice: 0.5,
      role: "taker",
      sizeUsd: 0,
      feeUsd: 0,
    },
    ...overrides,
  };
}
