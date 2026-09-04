import { existsSync } from "node:fs";
import type { RejectionReason } from "../core/rejectionReasons.js";
import type { ExecutionRoleMode } from "../core/venueFees.js";
import {
  recordOpportunity,
  type RuleMatchStatus,
} from "../execution/opportunityJournal.js";
import { recordOpportunityLegs } from "../execution/opportunityLegJournal.js";
import { recordScannerRun } from "../execution/scannerRunJournal.js";
import { classifyCapitalLock } from "../utils/marketTime.js";
import {
  CROSS_VENUE_ARB_STRATEGY,
  scanCrossVenuePairs,
  type CrossVenueArbOpportunity,
  type CrossVenuePair,
  type CrossVenueScanResult,
  type ScanCrossVenuePairsOptions,
} from "./crossVenueArbScanner.js";
import {
  discoverCrossVenuePairsWithDiagnostics,
  type CrossVenueDiscoveryResult,
  type CrossVenueMatchCandidatePreview,
  type DiscoverCrossVenuePairsOptions,
} from "./crossVenueMatcher.js";
import type { LiveOrderBookCache } from "./liveOrderbookCache.js";
import { loadCrossVenueConfig } from "../scripts/crossVenueArbScan.js";
import type { ScanCycleLogger } from "./runScanCycle.js";

/**
 * The cross-venue lane as a loop step.
 *
 * `crossvenue:scan` stays the explicit CLI with reports and dashboards; this is
 * the lean cycle the long-running scanner calls every few minutes. It reads
 * the same pair config, runs the same discovery and the same scanner, and then
 * journals every outcome - validated, no edge, mismatched - so the published
 * feed can show a cross-venue rejection next to a within-market one. It never
 * paper-fires: a cross-venue basket on an unverified pair is two open bets,
 * not a hedge, and the rule comparison is a human task.
 */

const DEFAULT_MISMATCH_ROWS_PER_CYCLE = 25;

const MISMATCH_STATUSES: ReadonlySet<CrossVenueMatchCandidatePreview["status"]> = new Set([
  "compound_kalshi_market",
  "resolution_time_mismatch",
  "resolution_terms_mismatch",
]);

export type CrossVenueCycleOptions = {
  pairsPath?: string;
  autoDiscover?: boolean;
  discoveryOptions?: DiscoverCrossVenuePairsOptions;
  discover?: (
    options: DiscoverCrossVenuePairsOptions,
  ) => Promise<CrossVenueDiscoveryResult>;
  scanPairs?: (
    pairs: CrossVenuePair[],
    options?: ScanCrossVenuePairsOptions,
  ) => Promise<CrossVenueScanResult>;
  roleMode?: ExecutionRoleMode;
  minNetCents?: number;
  orderbookCache?: LiveOrderBookCache;
  orderbookCacheMaxAgeMs?: number;
  maxMismatchRowsPerCycle?: number;
  logger?: ScanCycleLogger;
  now?: () => number;
};

export type CrossVenueCycleResult = {
  success: boolean;
  pairsScanned: number;
  opportunities: number;
  noEdge: number;
  rejectedPairs: number;
  mismatchCandidates: number;
  error?: string;
};

export async function runCrossVenueCycle(
  options: CrossVenueCycleOptions = {},
): Promise<CrossVenueCycleResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const logger = options.logger;
  const discover = options.discover ?? discoverCrossVenuePairsWithDiagnostics;
  const scanPairs = options.scanPairs ?? scanCrossVenuePairs;

  try {
    const config =
      options.pairsPath && existsSync(options.pairsPath)
        ? loadCrossVenueConfig(options.pairsPath)
        : { pairs: [] };
    const configuredPairs = (config.pairs ?? []).filter(
      (pair) => pair.enabled !== false,
    );
    const disabledIds = new Set(
      (config.pairs ?? []).filter((pair) => pair.enabled === false).map((pair) => pair.id),
    );
    let pairs: CrossVenuePair[] = configuredPairs;
    let discovery: CrossVenueDiscoveryResult | null = null;

    if (options.autoDiscover) {
      discovery = await discover(options.discoveryOptions ?? {});
      const seen = new Set(pairs.map((pair) => pair.id));

      for (const pair of discovery.pairs) {
        if (!disabledIds.has(pair.id) && !seen.has(pair.id)) {
          seen.add(pair.id);
          pairs = [...pairs, pair];
        }
      }
    }

    const result =
      pairs.length === 0
        ? null
        : await scanPairs(pairs, {
            feesCents: config.feesCents,
            minNetCents: options.minNetCents ?? config.minNetCents,
            orderbookCache: options.orderbookCache,
            orderbookCacheMaxAgeMs: options.orderbookCacheMaxAgeMs,
            roleMode: options.roleMode,
            nowMs: startedAt,
            warn: (message) => logger?.warn(message),
          });

    const pairsById = new Map(pairs.map((pair) => [pair.id, pair]));
    const nowMs = now();
    let validated = 0;
    let rejected = 0;

    for (const opportunity of result?.opportunities ?? []) {
      journalCrossVenueOpportunity(opportunity, pairsById.get(opportunity.pairId), nowMs);
      validated += 1;
    }

    for (const noEdge of result?.noEdge ?? []) {
      const pair = pairsById.get(noEdge.pairId);

      recordCrossVenueRejection({
        pair,
        pairId: noEdge.pairId,
        reason: noEdge.reason,
        rawEdge: noEdge.grossCents / 100,
        executableEdge: noEdge.netCents / 100,
        ruleMatch: pair?.verified ? "reviewed" : "unverified",
        nowMs,
      });
      rejected += 1;
    }

    for (const rejection of result?.rejected ?? []) {
      const pair = pairsById.get(rejection.pairId);
      const reason = rejection.reason as RejectionReason;

      recordCrossVenueRejection({
        pair,
        pairId: rejection.pairId,
        reason,
        rawEdge: null,
        executableEdge: null,
        ruleMatch: reason.startsWith("question_") ? "mismatch" : null,
        nowMs,
        detail: rejection.detail,
      });
      rejected += 1;
    }

    const mismatchCandidates = (discovery?.candidatePreview ?? [])
      .filter((candidate) => MISMATCH_STATUSES.has(candidate.status))
      .slice(0, options.maxMismatchRowsPerCycle ?? DEFAULT_MISMATCH_ROWS_PER_CYCLE);

    for (const candidate of mismatchCandidates) {
      recordOpportunity({
        strategy: CROSS_VENUE_ARB_STRATEGY,
        slug: candidate.polymarketSlug,
        title: candidate.polymarketQuestion || candidate.kalshiTitle,
        venues: ["kalshi", "polymarket"],
        category: candidate.category ?? null,
        rawEdge: null,
        status: "rejected",
        reason: candidate.status,
        ruleMatch: "mismatch",
        tokenIds: [candidate.kalshiTicker, candidate.polymarketSlug],
        timestamp: nowMs,
        ...capitalLockTelemetry(candidate.expectedResolutionAt ?? null, nowMs),
      });
      rejected += 1;
    }

    recordScannerRun({
      strategy: CROSS_VENUE_ARB_STRATEGY,
      timestamp: startedAt,
      rawOpportunities: pairs.length + mismatchCandidates.length,
      validatedOpportunities: validated,
      rejectedOpportunities: rejected,
      dedupeSkips: 0,
      paperTrades: 0,
      durationMs: Math.max(0, now() - startedAt),
    });

    logger?.info(
      `Cross-venue cycle: ${pairs.length} pair(s) scanned, ${validated} validated, ${
        result?.noEdge.length ?? 0
      } without edge, ${result?.rejected.length ?? 0} rejected, ${
        mismatchCandidates.length
      } mismatch candidate(s).`,
    );

    return {
      success: true,
      pairsScanned: pairs.length,
      opportunities: validated,
      noEdge: result?.noEdge.length ?? 0,
      rejectedPairs: result?.rejected.length ?? 0,
      mismatchCandidates: mismatchCandidates.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    recordScannerRun({
      strategy: CROSS_VENUE_ARB_STRATEGY,
      timestamp: startedAt,
      rawOpportunities: 0,
      durationMs: Math.max(0, now() - startedAt),
      error: message,
    });
    logger?.error(`Cross-venue cycle failed: ${message}`);

    return {
      success: false,
      pairsScanned: 0,
      opportunities: 0,
      noEdge: 0,
      rejectedPairs: 0,
      mismatchCandidates: 0,
      error: message,
    };
  }
}

function journalCrossVenueOpportunity(
  opportunity: CrossVenueArbOpportunity,
  pair: CrossVenuePair | undefined,
  nowMs: number,
): void {
  const depthUsd = roundUsd(opportunity.executableSize * opportunity.totalTopOfBookCost);
  const record = recordOpportunity({
    strategy: CROSS_VENUE_ARB_STRATEGY,
    slug: opportunity.slug,
    title: opportunity.title,
    venues: [opportunity.buyYesVenue, opportunity.buyNoVenue],
    category: opportunity.category ?? pair?.category ?? null,
    rawEdge: opportunity.grossCents / 100,
    executableEdge: opportunity.netCents / 100,
    feeAdjustedEdge: opportunity.netCents / 100,
    fillableUsd: depthUsd,
    minLegDepthUsd: roundUsd(
      opportunity.executableSize *
        Math.min(opportunity.yesLeg.averageFillPrice, opportunity.noLeg.averageFillPrice),
    ),
    legCount: 2,
    executableSum: opportunity.totalTopOfBookCost,
    basketSizeShares: opportunity.executableSize,
    basketCostUsd: opportunity.capitalUsd,
    basketPayoutUsd: opportunity.executableSize,
    basketProfitUsd: opportunity.maxProfitDollars,
    edgeBps: opportunity.executableNetEdgeBps,
    roiBps: opportunity.roiBps,
    maxPositiveBasketShares: opportunity.executableSize,
    maxPositiveBasketCostUsd: opportunity.capitalUsd,
    grossEdgeBps: opportunity.grossEdgeBps,
    netEdgeBps: opportunity.executableNetEdgeBps,
    feeUsd: roundUsd(opportunity.yesLeg.feeUsd + opportunity.noLeg.feeUsd),
    capitalUsd: opportunity.capitalUsd,
    depthUsd,
    annualizedPct: opportunity.annualizedPct,
    ruleMatch: opportunity.ruleMatch,
    status: "validated",
    reason: opportunity.reason,
    tokenIds: [opportunity.yesLeg.identifier, opportunity.noLeg.identifier],
    timestamp: nowMs,
    ...capitalLockTelemetry(opportunity.expectedResolutionAt ?? null, nowMs),
    daysToResolution: opportunity.daysToResolution,
  });

  recordOpportunityLegs(
    [opportunity.yesLeg, opportunity.noLeg].map((leg, index) => ({
      opportunityId: record.id,
      strategy: CROSS_VENUE_ARB_STRATEGY,
      slug: leg.venue === "polymarket" ? opportunity.slug : null,
      marketId: leg.identifier,
      question: opportunity.title,
      tokenId: leg.identifier,
      side: leg.side,
      averageFillPrice: leg.averageFillPrice,
      bestAsk: leg.bestAsk,
      maxFillableUsd: roundUsd(opportunity.executableSize * leg.averageFillPrice),
      fillable: true,
      reason: "fillable",
      venue: leg.venue,
      role: leg.role,
      shares: opportunity.executableSize,
      sizeUsd: leg.sizeUsd,
      feeUsd: leg.feeUsd,
      legIndex: index,
      timestamp: nowMs,
    })),
  );
}

function recordCrossVenueRejection(input: {
  pair: CrossVenuePair | undefined;
  pairId: string;
  reason: RejectionReason;
  rawEdge: number | null;
  executableEdge: number | null;
  ruleMatch: RuleMatchStatus | null;
  nowMs: number;
  detail?: string;
}): void {
  const pair = input.pair;

  recordOpportunity({
    strategy: CROSS_VENUE_ARB_STRATEGY,
    slug: pair?.polymarket.slug ?? input.pairId,
    title: pair?.title ?? input.pairId,
    venues: ["kalshi", "polymarket"],
    category: pair?.category ?? null,
    rawEdge: input.rawEdge,
    executableEdge: input.executableEdge,
    grossEdgeBps: input.rawEdge === null ? null : roundBps(input.rawEdge * 10_000),
    netEdgeBps: input.executableEdge === null ? null : roundBps(input.executableEdge * 10_000),
    legCount: 2,
    status: "rejected",
    reason: input.reason,
    ruleMatch: input.ruleMatch,
    tokenIds: pair ? [pair.kalshi.ticker, pair.polymarket.slug] : [input.pairId],
    timestamp: input.nowMs,
    ...capitalLockTelemetry(pair?.expectedResolutionAt ?? null, input.nowMs),
  });
}

function capitalLockTelemetry(expectedResolutionAt: number | null, nowMs: number) {
  const capitalLock = classifyCapitalLock(expectedResolutionAt, nowMs);

  return {
    expectedResolutionAt: capitalLock.expectedResolutionAt,
    durationHours: capitalLock.durationHours,
    capitalLockClass: capitalLock.capitalLockClass,
    daysToResolution:
      capitalLock.durationHours === null
        ? null
        : Math.round((capitalLock.durationHours / 24) * 10_000) / 10_000,
  };
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function roundBps(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
