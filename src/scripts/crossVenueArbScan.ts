import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { recordOpportunity } from "../execution/opportunityJournal.js";
import {
  CROSS_VENUE_ARB_STRATEGY,
  DEFAULT_CROSS_VENUE_MIN_NET_CENTS,
  emptyCrossVenueOrderbookReadMetrics,
  scanCrossVenuePairs,
  type CrossVenueArbOpportunity,
  type CrossVenueFeeConfig,
  type CrossVenueOrderbookReadMetrics,
  type CrossVenuePair,
  type CrossVenuePriceSpread,
} from "../scanner/crossVenueArbScanner.js";
import {
  discoverCrossVenuePairsWithDiagnostics,
  type DiscoverCrossVenuePairsOptions,
  type CrossVenueDiscoveryResult,
  type CrossVenueMatchCandidatePreview,
  type CrossVenueMatchedPair,
} from "../scanner/crossVenueMatcher.js";
import { LiveOrderBookCache } from "../scanner/liveOrderbookCache.js";
import { classifyCapitalLock } from "../utils/marketTime.js";

const DEFAULT_PAIRS_PATH = "config/crossVenuePairs.json";
const DEFAULT_CROSS_VENUE_GAMMA_LIMIT = 200;
const DEFAULT_CROSS_VENUE_KALSHI_LIMIT = 200;
const DEFAULT_CROSS_VENUE_KALSHI_MAX_PAGES = 5;
const DEFAULT_CROSS_VENUE_MAX_PAIRS = 25;
const DEFAULT_CROSS_VENUE_MIN_MATCH_SCORE = 0.7;
const DEFAULT_CROSS_VENUE_LIVE_FEED_PATH = resolve(
  "docs",
  "reports",
  "cross-venue-live-feed.json",
);
const MAX_LIVE_FEED_ENTRIES = 500;

type CrossVenueConfigFile = {
  feesCents?: CrossVenueFeeConfig;
  minNetCents?: number;
  pairs?: CrossVenuePair[];
};

export type CrossVenueScanCliOptions = {
  autoDiscover?: boolean;
  dbPath?: string;
  dryRun?: boolean;
  feesCents?: CrossVenueFeeConfig;
  gammaLimit?: number;
  gammaSearchLimit?: number;
  gammaSearchQueries?: string[];
  kalshiEventTickers?: string[];
  kalshiLimit?: number;
  kalshiMaxPages?: number;
  kalshiSeriesTickers?: string[];
  maxPairs?: number;
  minMatchScore?: number;
  minNetCents?: number;
  liveFeedPath?: string;
  orderbookCache?: LiveOrderBookCache;
  orderbookCacheMaxAgeMs?: number;
  pairs?: CrossVenuePair[];
  pairsPath?: string;
  quiet?: boolean;
  reportDate?: string;
  discoverPairsWithDiagnostics?: (
    options: DiscoverCrossVenuePairsOptions,
  ) => Promise<CrossVenueDiscoveryResult>;
  scanPairs?: typeof scanCrossVenuePairs;
};

export type CrossVenueReportData = {
  reportDate: string;
  generatedAt: string;
  configPath: string;
  autoDiscover: boolean;
  dryRun: boolean;
  minNetCents: number;
  feesCents: CrossVenueFeeConfig;
  orderbookReads: CrossVenueOrderbookReadMetrics;
  summary: {
    pairsScanned: number;
    opportunities: number;
    priceSpreads: number;
    rejectedPairs: number;
  };
  discoveryResult: CrossVenueDiscoveryResult | null;
  pairs: Array<CrossVenuePair | CrossVenueMatchedPair>;
  opportunities: CrossVenueArbOpportunity[];
  priceSpreads: CrossVenuePriceSpread[];
  rejectedPairs: Array<{ pairId: string; reason: string }>;
};

type CrossVenueReportArtifacts = {
  data: CrossVenueReportData;
  markdownPath: string;
  htmlPath: string;
  jsonPath: string;
};

export type CrossVenueLiveFeedEntry = {
  signature: string;
  kind: "opportunity" | "spread";
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  inactiveSinceAt?: string;
  seenCount: number;
  pairId: string;
  title: string;
  outcomeLabel: string;
  bestNetCents?: number;
  bestRoiBps?: number;
  bestProfitDollars?: number;
  bestDiffCents?: number;
  lastOpportunity?: CrossVenueArbOpportunity;
  lastPriceSpread?: CrossVenuePriceSpread;
};

export type CrossVenueLiveFeedData = {
  version: 1;
  generatedAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastReportDate: string | null;
  summary: {
    activeOpportunities: number;
    activePriceSpreads: number;
    inactiveEntries: number;
    totalEntries: number;
  };
  entries: CrossVenueLiveFeedEntry[];
};

export async function runCrossVenueArbScan(
  options: CrossVenueScanCliOptions = {},
): Promise<{
  dashboardPath: string;
  jsonPath: string;
  opportunities: number;
  priceSpreads: number;
  rejectedPairs: number;
  liveFeedPath: string;
  reportPath: string;
}> {
  const configPath =
    options.pairsPath ?? process.env.CROSS_VENUE_PAIRS_PATH ?? DEFAULT_PAIRS_PATH;
  const config = loadCrossVenueConfig(configPath);
  const minNetCents =
    options.minNetCents ??
    config.minNetCents ??
    parseOptionalNumber(process.env.CROSS_VENUE_MIN_NET_CENTS) ??
    DEFAULT_CROSS_VENUE_MIN_NET_CENTS;
  const feesCents = {
    ...(config.feesCents ?? {}),
    ...(loadFeeEnvOverrides(process.env) ?? {}),
    ...(options.feesCents ?? {}),
  };
  const configuredPairs: CrossVenuePair[] = options.pairs ?? config.pairs ?? [];
  const autoDiscover =
    options.autoDiscover ??
    parseOptionalBoolean(process.env.CROSS_VENUE_AUTO_DISCOVER) ??
    configuredPairs.length === 0;
  const disabledPairIds = new Set(
    configuredPairs.filter((pair) => !isCrossVenuePairEnabled(pair)).map((pair) => pair.id),
  );
  const activeConfiguredPairs = configuredPairs.filter(isCrossVenuePairEnabled);
  const orderbookCache = options.orderbookCache ?? new LiveOrderBookCache();
  let pairs: Array<CrossVenuePair | CrossVenueMatchedPair> = activeConfiguredPairs;
  let discoveryResult: CrossVenueDiscoveryResult | null = null;

  if (autoDiscover) {
    const discoverPairsWithDiagnostics =
      options.discoverPairsWithDiagnostics ??
      discoverCrossVenuePairsWithDiagnostics;
    discoveryResult = await discoverPairsWithDiagnostics({
      gammaLimit:
        options.gammaLimit ??
        parseOptionalNumber(process.env.CROSS_VENUE_GAMMA_LIMIT) ??
        DEFAULT_CROSS_VENUE_GAMMA_LIMIT,
      gammaSearchLimit:
        options.gammaSearchLimit ??
        parseOptionalNumber(process.env.CROSS_VENUE_GAMMA_SEARCH_LIMIT),
      gammaSearchQueries:
        options.gammaSearchQueries ??
        parseOptionalList(process.env.CROSS_VENUE_GAMMA_SEARCH),
      kalshiLimit:
        options.kalshiLimit ??
        parseOptionalNumber(process.env.CROSS_VENUE_KALSHI_LIMIT) ??
        DEFAULT_CROSS_VENUE_KALSHI_LIMIT,
      kalshiMaxPages:
        options.kalshiMaxPages ??
        parseOptionalNumber(process.env.CROSS_VENUE_KALSHI_MAX_PAGES) ??
        DEFAULT_CROSS_VENUE_KALSHI_MAX_PAGES,
      kalshiEventTickers:
        options.kalshiEventTickers ??
        parseOptionalList(process.env.CROSS_VENUE_KALSHI_EVENTS),
      kalshiSeriesTickers:
        options.kalshiSeriesTickers ??
        parseOptionalList(process.env.CROSS_VENUE_KALSHI_SERIES),
      maxPairs:
        options.maxPairs ??
        parseOptionalNumber(process.env.CROSS_VENUE_MAX_PAIRS) ??
        DEFAULT_CROSS_VENUE_MAX_PAIRS,
      minMatchScore:
        options.minMatchScore ??
        parseOptionalNumber(process.env.CROSS_VENUE_MIN_MATCH_SCORE) ??
        DEFAULT_CROSS_VENUE_MIN_MATCH_SCORE,
    });
    pairs = mergeCrossVenuePairs(
      activeConfiguredPairs,
      discoveryResult.pairs,
      disabledPairIds,
    );
  }

  initDb(options.dbPath ?? process.env.DATABASE_PATH);

  try {
    const result =
      pairs.length === 0
        ? {
            opportunities: [],
            priceSpreads: [],
            rejected: [],
            orderbookReads: emptyCrossVenueOrderbookReadMetrics(),
          }
        : await (options.scanPairs ?? scanCrossVenuePairs)(pairs, {
            feesCents,
            minNetCents,
            orderbookCache,
            orderbookCacheMaxAgeMs: options.orderbookCacheMaxAgeMs,
          });

    if (!options.dryRun) {
      for (const opportunity of result.opportunities) {
        recordCrossVenueOpportunity(opportunity);
      }
    }

    const reportDate = options.reportDate ?? new Date().toISOString().slice(0, 10);
    const reportArtifacts = writeCrossVenueReport({
      configPath,
      dryRun: Boolean(options.dryRun),
      feesCents,
      minNetCents,
      opportunities: result.opportunities,
      orderbookReads: result.orderbookReads,
      autoDiscover,
      discoveryResult,
      pairs,
      priceSpreads: result.priceSpreads,
      rejectedPairs: result.rejected,
      reportDate,
    });
    const liveFeedPath = updateCrossVenueLiveFeed(
      reportArtifacts.data,
      options.liveFeedPath ??
        process.env.CROSS_VENUE_LIVE_FEED_PATH ??
        DEFAULT_CROSS_VENUE_LIVE_FEED_PATH,
    );

    if (!options.quiet) {
      console.log(readFileSync(reportArtifacts.markdownPath, "utf8"));
    }

    return {
      dashboardPath: reportArtifacts.htmlPath,
      jsonPath: reportArtifacts.jsonPath,
      opportunities: result.opportunities.length,
      priceSpreads: result.priceSpreads.length,
      rejectedPairs: result.rejected.length,
      liveFeedPath,
      reportPath: reportArtifacts.markdownPath,
    };
  } finally {
    closeDb();
  }
}

function mergeCrossVenuePairs(
  configuredPairs: CrossVenuePair[],
  discoveredPairs: CrossVenueMatchedPair[],
  disabledPairIds = new Set<string>(),
): Array<CrossVenuePair | CrossVenueMatchedPair> {
  const seen = new Set<string>();
  const merged: Array<CrossVenuePair | CrossVenueMatchedPair> = [];

  for (const pair of [...configuredPairs, ...discoveredPairs]) {
    if (disabledPairIds.has(pair.id) || seen.has(pair.id)) {
      continue;
    }
    seen.add(pair.id);
    merged.push(pair);
  }

  return merged;
}

function isCrossVenuePairEnabled(pair: CrossVenuePair): boolean {
  return pair.enabled !== false;
}

function recordCrossVenueOpportunity(
  opportunity: CrossVenueArbOpportunity,
): void {
  const nowMs = Date.now();
  const capitalLock = classifyCapitalLock(
    opportunity.expectedResolutionAt,
    nowMs,
  );

  recordOpportunity({
    strategy: CROSS_VENUE_ARB_STRATEGY,
    slug: opportunity.slug,
    rawEdge: opportunity.grossCents / 100,
    executableEdge: opportunity.netCents / 100,
    feeAdjustedEdge: opportunity.netCents / 100,
    fillableUsd: roundUsd(opportunity.executableSize * opportunity.totalTopOfBookCost),
    minLegDepthUsd: roundUsd(
      opportunity.executableSize *
        Math.min(opportunity.yesLeg.averageFillPrice, opportunity.noLeg.averageFillPrice),
    ),
    legCount: 2,
    executableSum: opportunity.totalTopOfBookCost,
    basketSizeShares: opportunity.executableSize,
    basketCostUsd: roundUsd(opportunity.executableSize * opportunity.totalTopOfBookCost),
    basketPayoutUsd: opportunity.executableSize,
    basketProfitUsd: opportunity.maxProfitDollars,
    edgeBps: roundBps(opportunity.netCents * 100),
    roiBps: opportunity.roiBps,
    maxPositiveBasketShares: opportunity.executableSize,
    maxPositiveBasketCostUsd: roundUsd(
      opportunity.executableSize * opportunity.totalTopOfBookCost,
    ),
    expectedResolutionAt: capitalLock.expectedResolutionAt,
    durationHours: capitalLock.durationHours,
    capitalLockClass: capitalLock.capitalLockClass,
    status: "validated",
    reason: opportunity.reason,
    tokenIds: [
      opportunity.yesLeg.identifier,
      opportunity.noLeg.identifier,
    ],
    timestamp: nowMs,
  });
}

function writeCrossVenueReport(input: {
  autoDiscover: boolean;
  configPath: string;
  dryRun: boolean;
  feesCents: CrossVenueFeeConfig;
  minNetCents: number;
  opportunities: CrossVenueArbOpportunity[];
  orderbookReads: CrossVenueOrderbookReadMetrics;
  pairs: Array<CrossVenuePair | CrossVenueMatchedPair>;
  discoveryResult: CrossVenueDiscoveryResult | null;
  priceSpreads: CrossVenuePriceSpread[];
  rejectedPairs: Array<{ pairId: string; reason: string }>;
  reportDate: string;
}): CrossVenueReportArtifacts {
  const data = buildCrossVenueReportData(input);
  const reportPath = resolve(
    "docs",
    "reports",
    `cross-venue-arb-${input.reportDate}.md`,
  );
  const htmlPath = resolve(
    "docs",
    "reports",
    `cross-venue-dashboard-${input.reportDate}.html`,
  );
  const jsonPath = resolve(
    "docs",
    "reports",
    `cross-venue-arb-${input.reportDate}.json`,
  );
  const markdown = [
    `# Cross-Venue Arb Report - ${data.reportDate}`,
    "",
    `Config: \`${data.configPath}\``,
    `Auto-discover: ${data.autoDiscover ? "yes" : "no"}`,
    `Pairs scanned: ${data.summary.pairsScanned}`,
    `Minimum net edge: ${data.minNetCents.toFixed(2)} cents`,
    `Fees: Kalshi ${formatCents(data.feesCents.kalshi)} / Polymarket ${formatCents(data.feesCents.polymarket)}`,
    `Dry run: ${data.dryRun ? "yes" : "no"}`,
    `Dashboard: \`${htmlPath}\``,
    `JSON: \`${jsonPath}\``,
    "",
    "## Summary",
    "",
    `- Cross-venue arbs: ${data.summary.opportunities}`,
    `- Price spreads: ${data.summary.priceSpreads}`,
    `- Rejected pairs: ${data.summary.rejectedPairs}`,
    `- Orderbook reads: ${data.orderbookReads.total.reads}`,
    `- Cache hits: ${data.orderbookReads.total.cacheHits} (${data.orderbookReads.total.websocketHits} websocket, ${data.orderbookReads.total.liveWatchedHits} live-watched, ${data.orderbookReads.total.restHits} rest-cache)`,
    `- REST fetches: ${data.orderbookReads.total.restFetches}`,
    "- Execution: paper-only diagnostics; no orders.",
    "",
    "## Discovery Diagnostics",
    "",
    formatDiscoveryDiagnostics(data.discoveryResult),
    "",
    "## Matched Pairs",
    "",
    data.pairs.length === 0
      ? "_None_"
      : formatMatchedPairTable(data.pairs.slice(0, 25)),
    "",
    "## Arbitrage Opportunities",
    "",
    data.opportunities.length === 0
      ? "_None_"
      : formatOpportunityTable(data.opportunities),
    "",
    "## Price Differences",
    "",
    data.priceSpreads.length === 0
      ? "_None_"
      : formatSpreadTable(data.priceSpreads.slice(0, 25)),
    "",
    "## Rejected Pairs",
    "",
    data.rejectedPairs.length === 0
      ? "_None_"
      : formatRejectedTable(data.rejectedPairs),
    "",
    "## How This Works",
    "",
    "- Same outcome must be explicitly paired between Kalshi and Polymarket.",
    "- Auto-discovered pairs are conservative candidates and should still be reviewed before trusting the economics.",
    "- True arb check: buy YES on one venue and buy NO on the other.",
    "- Gross edge: `1 - YES_ask - NO_ask`.",
    "- Net edge subtracts configured per-contract fee estimates.",
    "- Depth walks both ask ladders together and stops when the next level is no longer positive after fees.",
    "- Price differences are directional signals only; they are not risk-free arbs.",
    "",
    "## Safety",
    "",
    "- Read-only public market data.",
    "- No live trading.",
    "- No order placement.",
    "- No private keys, wallets, signers, or secrets.",
    "",
  ].join("\n");

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, markdown, "utf8");
  writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(htmlPath, renderCrossVenueDashboardHtml(data), "utf8");

  return { data, markdownPath: reportPath, htmlPath, jsonPath };
}

export function readCrossVenueLiveFeed(
  path = DEFAULT_CROSS_VENUE_LIVE_FEED_PATH,
): CrossVenueLiveFeedData {
  if (!existsSync(path)) {
    return emptyCrossVenueLiveFeed();
  }

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (!isObject(parsed) || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid cross-venue live feed at ${path}.`);
  }

  return parsed as CrossVenueLiveFeedData;
}

export function updateCrossVenueLiveFeed(
  report: CrossVenueReportData,
  path = DEFAULT_CROSS_VENUE_LIVE_FEED_PATH,
): string {
  const previous = readCrossVenueLiveFeed(path);
  const previousBySignature = new Map(
    previous.entries.map((entry) => [entry.signature, entry]),
  );
  const now = report.generatedAt;
  const consumedPreviousSignatures = new Set<string>();
  const activeEntries = [
    ...report.opportunities.map((opportunity) => {
      const previousEntries = findPreviousOpportunityFeedEntries(
        previous.entries,
        previousBySignature,
        opportunity,
      );
      for (const previousEntry of previousEntries) {
        consumedPreviousSignatures.add(previousEntry.signature);
      }

      return buildOpportunityFeedEntry(opportunity, previousEntries[0], now);
    }),
    ...report.priceSpreads.map((spread) => {
      const previousEntries = findPreviousSpreadFeedEntries(
        previous.entries,
        previousBySignature,
        spread,
      );
      for (const previousEntry of previousEntries) {
        consumedPreviousSignatures.add(previousEntry.signature);
      }

      return buildSpreadFeedEntry(spread, previousEntries[0], now);
    }),
  ];
  const activeSignatures = new Set(activeEntries.map((entry) => entry.signature));
  const inactiveEntries = previous.entries
    .filter(
      (entry) =>
        !activeSignatures.has(entry.signature) &&
        !consumedPreviousSignatures.has(entry.signature),
    )
    .map((entry) =>
      entry.active
        ? {
            ...entry,
            active: false,
            inactiveSinceAt: now,
          }
        : entry,
    );
  const entries = [...activeEntries, ...inactiveEntries]
    .sort(compareLiveFeedEntries)
    .slice(0, MAX_LIVE_FEED_ENTRIES);
  const feed: CrossVenueLiveFeedData = {
    version: 1,
    generatedAt: previous.generatedAt || now,
    updatedAt: now,
    lastRunAt: now,
    lastReportDate: report.reportDate,
    summary: {
      activeOpportunities: activeEntries.filter((entry) => entry.kind === "opportunity").length,
      activePriceSpreads: activeEntries.filter((entry) => entry.kind === "spread").length,
      inactiveEntries: entries.filter((entry) => !entry.active).length,
      totalEntries: entries.length,
    },
    entries,
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(feed, null, 2)}\n`, "utf8");

  return path;
}

function emptyCrossVenueLiveFeed(): CrossVenueLiveFeedData {
  const now = new Date().toISOString();

  return {
    version: 1,
    generatedAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastReportDate: null,
    summary: {
      activeOpportunities: 0,
      activePriceSpreads: 0,
      inactiveEntries: 0,
      totalEntries: 0,
    },
    entries: [],
  };
}

function buildOpportunityFeedEntry(
  opportunity: CrossVenueArbOpportunity,
  previous: CrossVenueLiveFeedEntry | undefined,
  now: string,
): CrossVenueLiveFeedEntry {
  return {
    signature: opportunitySignature(opportunity),
    kind: "opportunity",
    active: true,
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now,
    seenCount: (previous?.seenCount ?? 0) + 1,
    pairId: opportunity.pairId,
    title: opportunity.title,
    outcomeLabel: opportunity.outcomeLabel,
    bestNetCents: Math.max(previous?.bestNetCents ?? Number.NEGATIVE_INFINITY, opportunity.netCents),
    bestRoiBps: Math.max(previous?.bestRoiBps ?? Number.NEGATIVE_INFINITY, opportunity.roiBps),
    bestProfitDollars: Math.max(
      previous?.bestProfitDollars ?? Number.NEGATIVE_INFINITY,
      opportunity.maxProfitDollars,
    ),
    lastOpportunity: opportunity,
  };
}

function buildSpreadFeedEntry(
  spread: CrossVenuePriceSpread,
  previous: CrossVenueLiveFeedEntry | undefined,
  now: string,
): CrossVenueLiveFeedEntry {
  return {
    signature: spreadSignature(spread),
    kind: "spread",
    active: true,
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now,
    seenCount: (previous?.seenCount ?? 0) + 1,
    pairId: spread.pairId,
    title: spread.title,
    outcomeLabel: spread.outcomeLabel,
    bestDiffCents: Math.max(previous?.bestDiffCents ?? Number.NEGATIVE_INFINITY, spread.diffCents),
    lastPriceSpread: spread,
  };
}

function opportunitySignature(opportunity: CrossVenueArbOpportunity): string {
  return [
    "opportunity",
    opportunity.yesLeg.venue,
    opportunity.yesLeg.identifier,
    opportunity.noLeg.venue,
    opportunity.noLeg.identifier,
  ].join("|");
}

function spreadSignature(spread: CrossVenuePriceSpread): string {
  return [
    "spread",
    spread.kalshiTicker ?? spread.pairId,
    spread.polymarketSlug ?? spread.pairId,
    spread.side,
    spread.cheapVenue,
    spread.richVenue,
  ].join("|");
}

function findPreviousOpportunityFeedEntries(
  entries: CrossVenueLiveFeedEntry[],
  bySignature: Map<string, CrossVenueLiveFeedEntry>,
  opportunity: CrossVenueArbOpportunity,
): CrossVenueLiveFeedEntry[] {
  return uniqueFeedEntries([
    bySignature.get(opportunitySignature(opportunity)),
    ...entries.filter(
      (entry) =>
        entry.kind === "opportunity" &&
        opportunityMatchesFeedEntry(opportunity, entry),
    ),
  ]);
}

function findPreviousSpreadFeedEntries(
  entries: CrossVenueLiveFeedEntry[],
  bySignature: Map<string, CrossVenueLiveFeedEntry>,
  spread: CrossVenuePriceSpread,
): CrossVenueLiveFeedEntry[] {
  return uniqueFeedEntries([
    bySignature.get(spreadSignature(spread)),
    ...entries.filter(
      (entry) =>
        entry.kind === "spread" &&
        spreadMatchesFeedEntry(spread, entry),
    ),
  ]);
}

function uniqueFeedEntries(
  entries: Array<CrossVenueLiveFeedEntry | undefined>,
): CrossVenueLiveFeedEntry[] {
  const unique = new Map<string, CrossVenueLiveFeedEntry>();

  for (const entry of entries) {
    if (entry) {
      unique.set(entry.signature, entry);
    }
  }

  return [...unique.values()].sort(compareLiveFeedEntries);
}

function opportunityMatchesFeedEntry(
  opportunity: CrossVenueArbOpportunity,
  entry: CrossVenueLiveFeedEntry,
): boolean {
  const previous = entry.lastOpportunity;

  return Boolean(
    previous &&
      previous.yesLeg.venue === opportunity.yesLeg.venue &&
      previous.yesLeg.identifier === opportunity.yesLeg.identifier &&
      previous.noLeg.venue === opportunity.noLeg.venue &&
      previous.noLeg.identifier === opportunity.noLeg.identifier,
  );
}

function spreadMatchesFeedEntry(
  spread: CrossVenuePriceSpread,
  entry: CrossVenueLiveFeedEntry,
): boolean {
  const previous = entry.lastPriceSpread;

  if (!previous) {
    return false;
  }

  const sameMarket =
    Boolean(
      spread.kalshiTicker &&
        previous.kalshiTicker &&
        spread.kalshiTicker === previous.kalshiTicker &&
        spread.polymarketSlug &&
        previous.polymarketSlug &&
        spread.polymarketSlug === previous.polymarketSlug,
    ) || spread.pairId === previous.pairId;

  return (
    sameMarket &&
    previous.side === spread.side &&
    previous.cheapVenue === spread.cheapVenue &&
    previous.richVenue === spread.richVenue
  );
}

function compareLiveFeedEntries(
  left: CrossVenueLiveFeedEntry,
  right: CrossVenueLiveFeedEntry,
): number {
  return (
    Number(right.active) - Number(left.active) ||
    Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt) ||
    (right.bestRoiBps ?? right.bestDiffCents ?? 0) -
      (left.bestRoiBps ?? left.bestDiffCents ?? 0) ||
    left.signature.localeCompare(right.signature)
  );
}

export function buildCrossVenueReportData(input: {
  autoDiscover: boolean;
  configPath: string;
  dryRun: boolean;
  feesCents: CrossVenueFeeConfig;
  minNetCents: number;
  opportunities: CrossVenueArbOpportunity[];
  orderbookReads?: CrossVenueOrderbookReadMetrics;
  pairs: Array<CrossVenuePair | CrossVenueMatchedPair>;
  discoveryResult: CrossVenueDiscoveryResult | null;
  priceSpreads: CrossVenuePriceSpread[];
  rejectedPairs: Array<{ pairId: string; reason: string }>;
  reportDate: string;
}): CrossVenueReportData {
  return {
    reportDate: input.reportDate,
    generatedAt: new Date().toISOString(),
    configPath: input.configPath,
    autoDiscover: input.autoDiscover,
    dryRun: input.dryRun,
    minNetCents: input.minNetCents,
    feesCents: input.feesCents,
    summary: {
      pairsScanned: input.pairs.length,
      opportunities: input.opportunities.length,
      priceSpreads: input.priceSpreads.length,
      rejectedPairs: input.rejectedPairs.length,
    },
    orderbookReads:
      input.orderbookReads ?? emptyCrossVenueOrderbookReadMetrics(),
    discoveryResult: input.discoveryResult,
    pairs: input.pairs,
    opportunities: input.opportunities,
    priceSpreads: input.priceSpreads,
    rejectedPairs: input.rejectedPairs,
  };
}

export function renderCrossVenueDashboardHtml(
  data: CrossVenueReportData,
): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Cross-Venue Arb Dashboard - ${escapeHtml(data.reportDate)}</title>`,
    "<style>",
    dashboardCss(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<section class="topbar">',
    "<div>",
    "<h1>Cross-Venue Arb Dashboard</h1>",
    `<p>${escapeHtml(data.generatedAt)} | paper-only | read-only market data</p>`,
    "</div>",
    '<div class="controls">',
    '<input id="search" type="search" placeholder="Filter markets, tickers, slugs">',
    '<button type="button" data-filter="all" class="active">All</button>',
    '<button type="button" data-filter="arb">Arbs</button>',
    '<button type="button" data-filter="spread">Spreads</button>',
    '<button type="button" data-filter="match">Matches</button>',
    '<button type="button" data-filter="near">Near matches</button>',
    "</div>",
    "</section>",
    renderDashboardCards(data),
    renderDashboardSection(
      "Arbitrage Opportunities",
      "arb",
      data.opportunities.length === 0
        ? emptyState("No executable cross-venue YES+NO arb found.")
        : renderArbRows(data.opportunities),
    ),
    renderDashboardSection(
      "Price Differences",
      "spread",
      data.priceSpreads.length === 0
        ? emptyState("No same-side price differences found.")
        : renderSpreadRows(data.priceSpreads),
    ),
    renderDashboardSection(
      "Matched Pairs",
      "match",
      data.pairs.length === 0
        ? emptyState("No matched pairs above the conservative threshold.")
        : renderPairRows(data.pairs),
    ),
    renderDashboardSection(
      "Discovery Near Matches",
      "near",
      !data.discoveryResult || data.discoveryResult.candidatePreview.length === 0
        ? emptyState("No near-match diagnostics available.")
        : renderCandidateRows(data.discoveryResult.candidatePreview),
    ),
    renderDashboardSection(
      "Rejected Pairs",
      "rejected",
      data.rejectedPairs.length === 0
        ? emptyState("No rejected scanned pairs.")
        : renderRejectedRows(data.rejectedPairs),
    ),
    '<section class="notes">',
    "<h2>Safety</h2>",
    "<p>No live trading, no orders, no CLOB client, no wallets, no private keys. Price spreads are directional signals, not risk-free arbitrage.</p>",
    "</section>",
    "</main>",
    "<script>",
    dashboardScript(),
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderDashboardCards(data: CrossVenueReportData): string {
  const discovery = data.discoveryResult;

  return [
    '<section class="cards">',
    renderMetricCard("Arbs", String(data.summary.opportunities), "true YES+NO cross-venue candidates"),
    renderMetricCard("Spreads", String(data.summary.priceSpreads), "same-side price differences"),
    renderMetricCard("Matched", String(data.summary.pairsScanned), "pairs scanned for books"),
    renderMetricCard(
      "Cache",
      `${data.orderbookReads.total.cacheHits}/${data.orderbookReads.total.reads}`,
      `${data.orderbookReads.total.websocketHits} websocket hits, ${data.orderbookReads.total.liveWatchedHits} live-watched, ${data.orderbookReads.total.restFetches} REST fetches`,
    ),
    renderMetricCard(
      "Discovery",
      discovery
        ? `${discovery.kalshiMarketCount} / ${discovery.polymarketMarketCount}`
        : "manual",
      "Kalshi / Polymarket markets read",
    ),
    renderMetricCard("Mode", data.dryRun ? "dry-run" : "journal", "paper-only; no orders"),
    "</section>",
  ].join("\n");
}

function renderMetricCard(label: string, value: string, help: string): string {
  return [
    '<article class="card">',
    `<span>${escapeHtml(label)}</span>`,
    `<strong>${escapeHtml(value)}</strong>`,
    `<small>${escapeHtml(help)}</small>`,
    "</article>",
  ].join("");
}

function renderDashboardSection(
  title: string,
  kind: string,
  content: string,
): string {
  return [
    `<section class="panel" data-section-kind="${escapeAttribute(kind)}">`,
    `<h2>${escapeHtml(title)}</h2>`,
    content,
    "</section>",
  ].join("\n");
}

function renderArbRows(opportunities: CrossVenueArbOpportunity[]): string {
  return renderTable(
    ["Pair", "Buy YES", "Buy NO", "Net", "ROI", "Size", "Profit"],
    opportunities.map((opportunity) => ({
      kind: "arb",
      text: [
        opportunity.title,
        opportunity.outcomeLabel,
        opportunity.slug,
        opportunity.buyYesVenue,
        opportunity.buyNoVenue,
      ].join(" "),
      cells: [
        `${opportunity.title} / ${opportunity.outcomeLabel}`,
        `${opportunity.buyYesVenue} @ ${formatPrice(opportunity.yesLeg.bestAsk)}`,
        `${opportunity.buyNoVenue} @ ${formatPrice(opportunity.noLeg.bestAsk)}`,
        `${opportunity.netCents.toFixed(2)}c`,
        `${opportunity.roiBps.toFixed(2)} bps`,
        opportunity.executableSize.toFixed(2),
        formatUsd(opportunity.maxProfitDollars),
      ],
    })),
  );
}

function renderSpreadRows(spreads: CrossVenuePriceSpread[]): string {
  return renderTable(
    ["Pair", "Side", "Cheap", "Rich", "Diff"],
    spreads.map((spread) => ({
      kind: "spread",
      text: [
        spread.title,
        spread.outcomeLabel,
        spread.side,
        spread.cheapVenue,
        spread.richVenue,
      ].join(" "),
      cells: [
        `${spread.title} / ${spread.outcomeLabel}`,
        spread.side,
        `${spread.cheapVenue} ${formatPrice(spread.cheapPrice)}`,
        `${spread.richVenue} ${formatPrice(spread.richPrice)}`,
        `${spread.diffCents.toFixed(2)}c`,
      ],
    })),
  );
}

function renderPairRows(
  pairs: Array<CrossVenuePair | CrossVenueMatchedPair>,
): string {
  return renderTable(
    ["Pair", "Kalshi", "Polymarket", "Match", "Reason"],
    pairs.map((pair) => ({
      kind: "match",
      text: [pair.title, pair.kalshi.ticker, pair.polymarket.slug].join(" "),
      cells: [
        pair.title,
        pair.kalshi.ticker,
        pair.polymarket.slug,
        isMatchedPair(pair) ? pair.matchScore.toFixed(3) : "manual",
        isMatchedPair(pair) ? pair.matchReason : "config",
      ],
    })),
  );
}

function renderCandidateRows(
  candidates: CrossVenueMatchCandidatePreview[],
): string {
  return renderTable(
    ["Kalshi", "Polymarket", "Score", "Status", "Shared"],
    candidates.map((candidate) => ({
      kind: "near",
      text: [
        candidate.kalshiTicker,
        candidate.kalshiTitle,
        candidate.polymarketSlug,
        candidate.polymarketQuestion,
        candidate.status,
      ].join(" "),
      cells: [
        `${candidate.kalshiTicker} / ${candidate.kalshiTitle}`,
        `${candidate.polymarketSlug} / ${candidate.polymarketQuestion}`,
        candidate.matchScore.toFixed(3),
        candidate.status,
        candidate.matchReason,
      ],
    })),
  );
}

function renderRejectedRows(
  rejectedPairs: Array<{ pairId: string; reason: string }>,
): string {
  return renderTable(
    ["Pair", "Reason"],
    rejectedPairs.map((rejected) => ({
      kind: "rejected",
      text: `${rejected.pairId} ${rejected.reason}`,
      cells: [rejected.pairId, rejected.reason],
    })),
  );
}

function renderTable(
  headers: string[],
  rows: Array<{ kind: string; text: string; cells: string[] }>,
): string {
  return [
    '<div class="table-wrap">',
    "<table>",
    "<thead>",
    `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`,
    "</thead>",
    "<tbody>",
    ...rows.map(
      (row) =>
        `<tr class="filter-row" data-kind="${escapeAttribute(row.kind)}" data-text="${escapeAttribute(row.text)}">${row.cells
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join("")}</tr>`,
    ),
    "</tbody>",
    "</table>",
    "</div>",
  ].join("\n");
}

function emptyState(message: string): string {
  return `<p class="empty">${escapeHtml(message)}</p>`;
}

function dashboardCss(): string {
  return `
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --panel: #ffffff;
  --ink: #14171f;
  --muted: #697080;
  --line: #dde2ea;
  --accent: #0f766e;
  --accent-soft: #d9f3ef;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.shell {
  width: min(1440px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 40px;
}
.topbar {
  display: flex;
  gap: 20px;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 18px;
}
h1, h2, p { margin: 0; }
h1 { font-size: 26px; letter-spacing: 0; }
h2 { font-size: 16px; margin-bottom: 12px; }
.topbar p, .card span, .card small, .empty, .notes p { color: var(--muted); }
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
input, button {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 6px;
  min-height: 36px;
}
input {
  width: min(360px, 100%);
  padding: 0 12px;
}
button {
  padding: 0 12px;
  cursor: pointer;
}
button.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: #064e46;
}
.cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.card, .panel, .notes {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.card {
  padding: 12px;
  display: grid;
  gap: 4px;
}
.card strong { font-size: 21px; }
.panel, .notes {
  padding: 14px;
  margin-top: 12px;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}
th, td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
th {
  background: #f0f3f7;
  color: #424a59;
  font-size: 12px;
  text-transform: uppercase;
}
tr:last-child td { border-bottom: 0; }
.empty {
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 8px;
}
[hidden] { display: none !important; }
@media (max-width: 900px) {
  .topbar { display: block; }
  .controls { justify-content: flex-start; margin-top: 12px; }
  .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;
}

function dashboardScript(): string {
  return `
const search = document.querySelector("#search");
const buttons = [...document.querySelectorAll("[data-filter]")];
let activeFilter = "all";

function applyFilters() {
  const query = (search?.value || "").trim().toLowerCase();
  for (const section of document.querySelectorAll("[data-section-kind]")) {
    const sectionKind = section.getAttribute("data-section-kind") || "";
    const sectionMatchesFilter =
      activeFilter === "all" || sectionKind === activeFilter;
    const rows = [...section.querySelectorAll(".filter-row")];
    let visibleRows = 0;

    for (const row of rows) {
      const text = (row.getAttribute("data-text") || "").toLowerCase();
      const visible = sectionMatchesFilter && (!query || text.includes(query));
      row.hidden = !visible;
      if (visible) visibleRows += 1;
    }

    section.hidden =
      !sectionMatchesFilter || (rows.length > 0 && visibleRows === 0);
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    activeFilter = button.getAttribute("data-filter") || "all";
    for (const other of buttons) other.classList.toggle("active", other === button);
    applyFilters();
  });
}

search?.addEventListener("input", applyFilters);
applyFilters();
`;
}

function formatDiscoveryDiagnostics(
  discoveryResult: CrossVenueDiscoveryResult | null,
): string {
  if (!discoveryResult) {
    return "_Not used._";
  }

  return [
    `- Kalshi markets read: ${discoveryResult.kalshiMarketCount}`,
    `- Polymarket binary markets read: ${discoveryResult.polymarketMarketCount}`,
    `- Matched pairs above threshold: ${discoveryResult.pairs.length}`,
    "",
    discoveryResult.candidatePreview.length === 0
      ? "_No shared-token candidate preview available._"
      : [
          "| Kalshi | Polymarket | Score | Status | Shared Tokens |",
          "| --- | --- | ---: | --- | --- |",
          ...discoveryResult.candidatePreview.map(
            (candidate) =>
              `| ${candidate.kalshiTicker} | ${candidate.polymarketSlug} | ${candidate.matchScore.toFixed(3)} | ${candidate.status} | ${candidate.matchReason} |`,
          ),
        ].join("\n"),
  ].join("\n");
}

function loadCrossVenueConfig(path: string): CrossVenueConfigFile {
  if (!existsSync(path)) {
    return { pairs: [] };
  }

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));

  if (!isObject(parsed)) {
    throw new Error(`Invalid cross-venue config at ${path}: expected object.`);
  }

  const pairs = Array.isArray(parsed.pairs)
    ? parsed.pairs.map(parsePair)
    : [];

  return {
    feesCents: parseFees(parsed.feesCents),
    minNetCents:
      "minNetCents" in parsed ? parseNumber(parsed.minNetCents) : undefined,
    pairs,
  };
}

function parsePair(value: unknown): CrossVenuePair {
  if (!isObject(value)) {
    throw new Error("Invalid cross-venue pair: expected object.");
  }

  if (!isObject(value.kalshi) || !isObject(value.polymarket)) {
    throw new Error("Invalid cross-venue pair: kalshi and polymarket are required.");
  }

  const canonicalEvent = parseCanonicalEventValue(value.canonicalEvent);
  const canonicalOutcome = parseCanonicalOutcomeValue(value.canonicalOutcome);

  return {
    id: stringValue(value.id),
    title: stringValue(value.title),
    outcomeLabel: stringValue(value.outcomeLabel),
    category: stringValue(value.category) || undefined,
    enabled: value.enabled === false ? false : true,
    priority: value.priority === true,
    verified: value.verified === true,
    note: stringValue(value.note) || undefined,
    expectedResolutionAt:
      "expectedResolutionAt" in value
        ? parseNullableTimestamp(value.expectedResolutionAt)
        : undefined,
    liquidityDollars:
      "liquidityDollars" in value ? parseNullableNumber(value.liquidityDollars) : undefined,
    volume24h:
      "volume24h" in value ? parseNullableNumber(value.volume24h) : undefined,
    ...(canonicalEvent ? { canonicalEvent } : {}),
    ...(canonicalOutcome ? { canonicalOutcome } : {}),
    kalshi: {
      ticker: stringValue(value.kalshi.ticker),
      liquidityDollars:
        "liquidityDollars" in value.kalshi
          ? parseNullableNumber(value.kalshi.liquidityDollars)
          : undefined,
      volume24h:
        "volume24h" in value.kalshi
          ? parseNullableNumber(value.kalshi.volume24h)
          : undefined,
    },
    polymarket: {
      slug: stringValue(value.polymarket.slug),
      yesTokenId: stringValue(value.polymarket.yesTokenId),
      noTokenId: stringValue(value.polymarket.noTokenId),
      liquidityDollars:
        "liquidityDollars" in value.polymarket
          ? parseNullableNumber(value.polymarket.liquidityDollars)
          : undefined,
      volume24h:
        "volume24h" in value.polymarket
          ? parseNullableNumber(value.polymarket.volume24h)
          : undefined,
    },
  };
}

function parseCanonicalEventValue(
  value: unknown,
): CrossVenuePair["canonicalEvent"] {
  return isObject(value) && Array.isArray(value.outcomes)
    ? (value as CrossVenuePair["canonicalEvent"])
    : undefined;
}

function parseCanonicalOutcomeValue(
  value: unknown,
): CrossVenuePair["canonicalOutcome"] {
  return isObject(value) && Array.isArray(value.venueRefs)
    ? (value as CrossVenuePair["canonicalOutcome"])
    : undefined;
}

function parseOptions(argv: string[]): CrossVenueScanCliOptions {
  const dbArg = findValueArg(argv, "--db=");
  const dateArg = findValueArg(argv, "--date=");
  const pairsArg = findValueArg(argv, "--pairs=");
  const minNetArg = findValueArg(argv, "--min-net-cents=");
  const gammaLimitArg = findValueArg(argv, "--gamma-limit=");
  const gammaSearchArg = findValueArg(argv, "--gamma-search=");
  const gammaSearchLimitArg = findValueArg(argv, "--gamma-search-limit=");
  const kalshiLimitArg = findValueArg(argv, "--kalshi-limit=");
  const kalshiPagesArg = findValueArg(argv, "--kalshi-pages=");
  const kalshiEventsArg = findValueArg(argv, "--kalshi-events=");
  const kalshiSeriesArg = findValueArg(argv, "--kalshi-series=");
  const maxPairsArg = findValueArg(argv, "--max-pairs=");
  const minMatchScoreArg = findValueArg(argv, "--min-match-score=");

  return {
    autoDiscover: argv.includes("--auto-discover")
      ? true
      : argv.includes("--no-auto-discover")
        ? false
        : undefined,
    dbPath: dbArg,
    dryRun: argv.includes("--dry-run"),
    gammaLimit:
      gammaLimitArg === undefined ? undefined : parseNumber(gammaLimitArg),
    gammaSearchLimit:
      gammaSearchLimitArg === undefined
        ? undefined
        : parseNumber(gammaSearchLimitArg),
    gammaSearchQueries:
      gammaSearchArg === undefined ? undefined : parseList(gammaSearchArg),
    kalshiLimit:
      kalshiLimitArg === undefined ? undefined : parseNumber(kalshiLimitArg),
    kalshiMaxPages:
      kalshiPagesArg === undefined ? undefined : parseNumber(kalshiPagesArg),
    kalshiEventTickers:
      kalshiEventsArg === undefined ? undefined : parseList(kalshiEventsArg),
    kalshiSeriesTickers:
      kalshiSeriesArg === undefined ? undefined : parseList(kalshiSeriesArg),
    maxPairs: maxPairsArg === undefined ? undefined : parseNumber(maxPairsArg),
    minMatchScore:
      minMatchScoreArg === undefined ? undefined : parseNumber(minMatchScoreArg),
    minNetCents: minNetArg === undefined ? undefined : parseNumber(minNetArg),
    pairsPath: pairsArg,
    reportDate: dateArg,
  };
}

function formatMatchedPairTable(
  pairs: Array<CrossVenuePair | CrossVenueMatchedPair>,
): string {
  return [
    "| Pair | Kalshi | Polymarket | Match | Reason |",
    "| --- | --- | --- | ---: | --- |",
    ...pairs.map((pair) => {
      const matchScore = isMatchedPair(pair) ? pair.matchScore.toFixed(3) : "manual";
      const reason = isMatchedPair(pair) ? pair.matchReason : "config";

      return `| ${pair.title} | ${pair.kalshi.ticker} | ${pair.polymarket.slug} | ${matchScore} | ${reason} |`;
    }),
  ].join("\n");
}

function formatOpportunityTable(
  opportunities: CrossVenueArbOpportunity[],
): string {
  return [
    "| Pair | Outcome | Buy YES | Buy NO | Net cents | ROI bps | Size | Max profit |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: |",
    ...opportunities.map(
      (opportunity) =>
        `| ${opportunity.title} | ${opportunity.outcomeLabel} | ${opportunity.buyYesVenue} @ ${opportunity.yesLeg.bestAsk.toFixed(4)} | ${opportunity.buyNoVenue} @ ${opportunity.noLeg.bestAsk.toFixed(4)} | ${opportunity.netCents.toFixed(2)} | ${opportunity.roiBps.toFixed(2)} | ${opportunity.executableSize.toFixed(2)} | $${opportunity.maxProfitDollars.toFixed(2)} |`,
    ),
  ].join("\n");
}

function formatSpreadTable(spreads: CrossVenuePriceSpread[]): string {
  return [
    "| Pair | Outcome | Side | Cheap | Rich | Diff cents |",
    "| --- | --- | --- | --- | --- | ---: |",
    ...spreads.map(
      (spread) =>
        `| ${spread.title} | ${spread.outcomeLabel} | ${spread.side} | ${spread.cheapVenue} ${spread.cheapPrice.toFixed(4)} | ${spread.richVenue} ${spread.richPrice.toFixed(4)} | ${spread.diffCents.toFixed(2)} |`,
    ),
  ].join("\n");
}

function formatRejectedTable(
  rejectedPairs: Array<{ pairId: string; reason: string }>,
): string {
  return [
    "| Pair | Reason |",
    "| --- | --- |",
    ...rejectedPairs.map((rejected) => `| ${rejected.pairId} | ${rejected.reason} |`),
  ].join("\n");
}

function formatPrice(value: number): string {
  return value.toFixed(4);
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/\n/gu, " ");
}

function parseFees(value: unknown): CrossVenueFeeConfig | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    kalshi: "kalshi" in value ? parseNumber(value.kalshi) : undefined,
    polymarket:
      "polymarket" in value ? parseNumber(value.polymarket) : undefined,
  };
}

function loadFeeEnvOverrides(env: NodeJS.ProcessEnv): CrossVenueFeeConfig {
  return {
    kalshi: parseOptionalNumber(env.CROSS_VENUE_KALSHI_FEE_CENTS),
    polymarket: parseOptionalNumber(env.CROSS_VENUE_POLYMARKET_FEE_CENTS),
  };
}

function parseNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Invalid expectedResolutionAt value: ${String(value)}`);
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parseNumber(value);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  throw new Error(`Expected boolean, got "${value}".`);
}

function parseOptionalList(value: string | undefined): string[] | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parseList(value);
}

function parseList(value: string): string[] {
  const unique = new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

  return [...unique];
}

function parseNumber(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected number, got "${String(value)}".`);
  }

  return parsed;
}

function findValueArg(argv: string[], prefix: string): string | undefined {
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatCents(value: number | undefined): string {
  return `${(value ?? 0).toFixed(2)}c`;
}

function isMatchedPair(
  pair: CrossVenuePair | CrossVenueMatchedPair,
): pair is CrossVenueMatchedPair {
  return "matchScore" in pair;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundBps(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runCrossVenueArbScan(parseOptions(process.argv.slice(2))).catch(
    (error: unknown) => {
      console.error(
        `cross-venue arb scan failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exitCode = 1;
    },
  );
}
