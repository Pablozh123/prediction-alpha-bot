import { existsSync } from "node:fs";
import {
  DEFAULT_MIN_ANNUALIZED_NET_PCT,
  meetsAnnualizedHurdle,
} from "../core/opportunityEconomics.js";
import { gateForReason, type RejectionReason } from "../core/rejectionReasons.js";
import {
  legacyRuleMatch,
  rejectionFromRuleScreen,
  ruleScreenFromRejection,
  type RuleReviewStatus,
  type RuleScreenStatus,
} from "../core/taxonomy.js";
import { screenTitlePair } from "./crossVenueQuestionMatch.js";
import type { ExecutionRoleMode } from "../core/venueFees.js";
import {
  upsertCrossVenuePair,
  type CrossVenuePairReviewRecord,
} from "../execution/crossVenuePairJournal.js";
import {
  recordOpportunity,
  updateOpportunityStatus,
  type OpportunityStatus,
} from "../execution/opportunityJournal.js";
import { executeOrPaper, type ExecuteOrPaperInput } from "../execution/executeOrPaper.js";
import {
  buildPaperFireDedupeKey,
  getRecentPaperFire,
  recordPaperDedupeSkip,
  recordPaperFire,
} from "../execution/paperDedupe.js";
import { kalshiPaperSlug } from "../utils/kalshi.js";
import { recordOpportunityLegs } from "../execution/opportunityLegJournal.js";
import { recordScannerRun } from "../execution/scannerRunJournal.js";
import { classifyCapitalLock, DEFAULT_MAX_SHORT_DURATION_HOURS } from "../utils/marketTime.js";
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
import { classifyHorizon, type ScanCycleLogger } from "./runScanCycle.js";

/** Target capital per basket when the caller sets none (PAPER_TARGET_SIZE_USD). */
const DEFAULT_CROSS_VENUE_PAPER_SIZE_USD = 20;
/** The same basket does not fire twice inside this window. */
const DEFAULT_CROSS_VENUE_PAPER_FIRE_COOLDOWN_MS = 60 * 60 * 1000;
/** A reviewed pair that clears every gate but locks capital past the short window. */
const CARRY_CANDIDATE_REASON = "carry_candidate";
/** Dedupe threshold field for a YES plus NO basket: the dollar it sums below. */
const CROSS_VENUE_DEDUPE_THRESHOLD = 1;

type CrossVenuePaperLeg = Omit<ExecuteOrPaperInput, "opportunityId">;

/**
 * The cross-venue lane as a loop step.
 *
 * `crossvenue:scan` stays the explicit CLI with reports and dashboards; this is
 * the lean cycle the long-running scanner calls every few minutes. It reads
 * the same pair config, runs the same discovery and the same scanner, and then
 * journals every outcome - validated, candidate, no edge, mismatched - so the
 * published feed can show a cross-venue rejection next to a within-market one.
 *
 * The pair protocol of docs/ARB_TAXONOMY.md decides what a positive number
 * means. The automated screen (gate 1) only says whether two titles ask the
 * same question. A person's review of both rulebooks decides whether the
 * basket is hedged: `equivalent` makes a positive, above-hurdle pair a
 * validated chance, `not_equivalent` rejects it at gate 1 with no return
 * figures, and everything else leaves it a candidate. The lane never
 * paper-fires (decision E2): a cross-venue basket on an unreviewed pair is
 * two open bets, not a hedge.
 */

const DEFAULT_MISMATCH_ROWS_PER_CYCLE = 25;

const MISMATCH_STATUSES: ReadonlySet<CrossVenueMatchCandidatePreview["status"]> = new Set([
  "compound_kalshi_market",
  "resolution_time_mismatch",
  "resolution_terms_mismatch",
]);

export const CROSS_VENUE_CANDIDATE_REASON = "cross_venue_candidate";

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
  /** Annualised net return in percent a pair must clear (decision E1). */
  hurdlePct?: number;
  /** Capital each fired basket targets against the books (PAPER_TARGET_SIZE_USD). */
  paperSizeUsd?: number;
  /** The short window in hours; a reviewed pair inside it paper-fires (E5). */
  maxShortDurationHours?: number;
  paperFireCooldownMs?: number;
  execute?: typeof executeOrPaper;
  sendAlert?: (message: string) => Promise<unknown>;
  orderbookCache?: LiveOrderBookCache;
  orderbookCacheMaxAgeMs?: number;
  maxMismatchRowsPerCycle?: number;
  logger?: ScanCycleLogger;
  now?: () => number;
};

export type CrossVenueCycleResult = {
  success: boolean;
  pairsScanned: number;
  /** Reviewed-equivalent pairs with a net edge above the hurdle. */
  opportunities: number;
  /** Net edge above the hurdle, rulebooks not yet confirmed by a person. */
  candidates: number;
  noEdge: number;
  rejectedPairs: number;
  mismatchCandidates: number;
  /** Paper legs written this cycle: two per fired pair. */
  paperTrades: number;
  /** Reviewed chances that had fired inside the cooldown already. */
  dedupeSkips: number;
  error?: string;
};

type PairOutcome = {
  status: OpportunityStatus | "no_edge";
  ruleScreen: RuleScreenStatus | null;
  ruleScreenDetail: string | null;
  grossCents: number | null;
  netCents: number | null;
  annualizedPct: number | null;
  executableSize: number | null;
};

export async function runCrossVenueCycle(
  options: CrossVenueCycleOptions = {},
): Promise<CrossVenueCycleResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const logger = options.logger;
  const discover = options.discover ?? discoverCrossVenuePairsWithDiagnostics;
  const scanPairs = options.scanPairs ?? scanCrossVenuePairs;
  const hurdlePct = options.hurdlePct ?? DEFAULT_MIN_ANNUALIZED_NET_PCT;
  const paperSizeUsd = options.paperSizeUsd ?? DEFAULT_CROSS_VENUE_PAPER_SIZE_USD;
  const maxShortDurationHours =
    options.maxShortDurationHours ?? DEFAULT_MAX_SHORT_DURATION_HOURS;
  const paperFireCooldownMs =
    options.paperFireCooldownMs ?? DEFAULT_CROSS_VENUE_PAPER_FIRE_COOLDOWN_MS;
  const execute = options.execute ?? executeOrPaper;

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
    const configuredIds = new Set(configuredPairs.map((pair) => pair.id));
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

    const pairsById = new Map(pairs.map((pair) => [pair.id, pair]));
    const outcomes = new Map<string, PairOutcome>();
    const nowMs = now();
    let validated = 0;
    let candidates = 0;
    let rejected = 0;
    let paperTrades = 0;
    let dedupeSkips = 0;

    // Gate 1 before any book is read. A person's not_equivalent verdict
    // rejects the pair outright; a failed title-and-date screen rejects it
    // unless a person found the rulebooks equivalent (the review outranks
    // the screen, its checklist covers the dates). Both are journaled with
    // no return figures, and neither costs an orderbook call.
    const screens = new Map<string, ReturnType<typeof screenTitlePair>>();
    const toScan: CrossVenuePair[] = [];

    for (const pair of pairs) {
      const review = reviewStatusOf(pair);
      const screen = screenTitlePair({
        polymarketTitle: pair.polymarket.question ?? pair.title,
        kalshiTitle: pair.kalshi.title ?? pair.title,
        kalshiTicker: pair.kalshi.ticker,
        polymarketEnd: pair.polymarket.expectedResolutionAt ?? null,
        kalshiEnd: pair.kalshi.expectedResolutionAt ?? null,
      });

      screens.set(pair.id, screen);

      if (review === "not_equivalent") {
        recordCrossVenueRejection({
          pair,
          pairId: pair.id,
          reason: "rule_review_not_equivalent",
          rawEdge: null,
          executableEdge: null,
          ruleScreen: screenStatusOf(screen.verdict),
          ruleReview: review,
          nowMs,
        });
        rejected += 1;
        outcomes.set(pair.id, emptyOutcome("rejected", screenStatusOf(screen.verdict), screen.reasons.join("; ") || null));
        continue;
      }

      const screenRejection = rejectionFromRuleScreen(screenStatusOf(screen.verdict));

      if (screenRejection && review !== "equivalent") {
        recordCrossVenueRejection({
          pair,
          pairId: pair.id,
          reason: screenRejection,
          rawEdge: null,
          executableEdge: null,
          ruleScreen: screenStatusOf(screen.verdict),
          ruleReview: review,
          nowMs,
          detail: screen.reasons.join("; "),
        });
        rejected += 1;
        outcomes.set(pair.id, emptyOutcome("rejected", screenStatusOf(screen.verdict), screen.reasons.join("; ") || null));
        continue;
      }

      toScan.push(pair);
    }

    const result =
      toScan.length === 0
        ? null
        : await scanPairs(toScan, {
            feesCents: config.feesCents,
            minNetCents: options.minNetCents ?? config.minNetCents,
            orderbookCache: options.orderbookCache,
            orderbookCacheMaxAgeMs: options.orderbookCacheMaxAgeMs,
            roleMode: options.roleMode,
            nowMs: startedAt,
            warn: (message) => logger?.warn(message),
          });

    for (const opportunity of result?.opportunities ?? []) {
      const pair = pairsById.get(opportunity.pairId);
      const review = reviewStatusOf(pair);

      if (review === "not_equivalent") {
        // A test double can return an opportunity for a pair the pre-screen
        // never scanned; the verdict still holds.
        recordCrossVenueRejection({
          pair,
          pairId: opportunity.pairId,
          reason: "rule_review_not_equivalent",
          rawEdge: null,
          executableEdge: null,
          ruleScreen: "passed",
          ruleReview: review,
          nowMs,
        });
        rejected += 1;
        outcomes.set(opportunity.pairId, outcomeOf("rejected", "passed", null, opportunity));
        continue;
      }

      if (!meetsAnnualizedHurdle(opportunity.annualizedPct, hurdlePct)) {
        journalCrossVenueOpportunity(opportunity, pair, nowMs, {
          status: "rejected",
          reason: "below_annualized_hurdle",
          ruleReview: review,
        });
        rejected += 1;
        outcomes.set(opportunity.pairId, outcomeOf("rejected", "passed", null, opportunity));
        continue;
      }

      if (review !== "equivalent") {
        // Above the hurdle, but nobody has read both rulebooks: two open
        // bets with a good number, journaled as a candidate, never fired.
        journalCrossVenueOpportunity(opportunity, pair, nowMs, {
          status: "candidate",
          reason: CROSS_VENUE_CANDIDATE_REASON,
          ruleReview: review,
        });
        candidates += 1;
        outcomes.set(opportunity.pairId, outcomeOf("candidate", "passed", null, opportunity));
        continue;
      }

      // Gate 4 for a pair a person found equivalent: the capital lock is a
      // class. Since decision E5 (2026-09-05, Kalshi is tradable for the
      // operator) a short lock paper-fires both legs; medium and long are
      // carry candidates, as in every other class.
      const horizon = classifyHorizon({
        expectedResolutionAt: opportunity.expectedResolutionAt ?? null,
        nowMs,
        annualizedPct: opportunity.annualizedPct,
        hurdlePct,
        maxShortDurationHours,
      });

      if (horizon.reject) {
        journalCrossVenueOpportunity(opportunity, pair, nowMs, {
          status: "rejected",
          reason: horizon.reject,
          ruleReview: review,
        });
        rejected += 1;
        outcomes.set(opportunity.pairId, outcomeOf("rejected", "passed", null, opportunity));
        continue;
      }

      const legs = pair ? crossVenuePaperLegs(opportunity, pair, paperSizeUsd) : null;

      if (!horizon.fireable || !legs) {
        if (horizon.fireable && !legs) {
          logger?.warn(
            `cross-venue pair ${opportunity.pairId}: fireable but no paper legs could be sized; kept as a candidate.`,
          );
        }

        journalCrossVenueOpportunity(opportunity, pair, nowMs, {
          status: "candidate",
          reason: horizon.fireable ? CROSS_VENUE_CANDIDATE_REASON : CARRY_CANDIDATE_REASON,
          ruleReview: review,
        });
        candidates += 1;
        outcomes.set(opportunity.pairId, outcomeOf("candidate", "passed", null, opportunity));
        continue;
      }

      // Gate 5: flow control. The same basket does not fire twice inside
      // the cooldown; the skip is recorded and the chance stays a chance.
      const tokenIds = [opportunity.yesLeg.identifier, opportunity.noLeg.identifier];
      const dedupeKey = buildPaperFireDedupeKey({
        strategy: CROSS_VENUE_ARB_STRATEGY,
        eventSlug: opportunity.slug,
        threshold: CROSS_VENUE_DEDUPE_THRESHOLD,
        tokenIds,
      });
      const recentFire = getRecentPaperFire(dedupeKey, nowMs, paperFireCooldownMs);

      if (recentFire) {
        recordPaperDedupeSkip({
          dedupeKey,
          strategy: CROSS_VENUE_ARB_STRATEGY,
          slug: opportunity.slug,
          threshold: CROSS_VENUE_DEDUPE_THRESHOLD,
          tokenIds,
          previousFireAt: recentFire.fired_at,
          skippedAt: nowMs,
          cooldownMs: paperFireCooldownMs,
        });
        dedupeSkips += 1;
        validated += 1;
        outcomes.set(opportunity.pairId, outcomeOf("validated", "passed", null, opportunity));
        continue;
      }

      const opportunityId = journalCrossVenueOpportunity(opportunity, pair, nowMs, {
        status: "validated",
        reason: opportunity.reason,
        ruleReview: review,
      });

      for (const leg of legs) {
        execute({ ...leg, opportunityId });
        paperTrades += 1;
      }

      recordPaperFire({
        dedupeKey,
        strategy: CROSS_VENUE_ARB_STRATEGY,
        eventSlug: opportunity.slug,
        firedAt: nowMs,
      });
      updateOpportunityStatus(opportunityId, {
        status: "paper_fired",
        reason: "paper_trade_recorded",
      });
      validated += 1;
      outcomes.set(opportunity.pairId, outcomeOf("paper_fired", "passed", null, opportunity));

      const fired = `Paper opportunity fired (cross-venue): ${opportunity.title} [${opportunity.pairId}], net ${opportunity.netCents} cents a share, ${legs[0]?.paperSizeShares ?? 0} shares, ${opportunity.buyYesVenue} YES against ${opportunity.buyNoVenue} NO.`;

      logger?.info(fired);

      if (options.sendAlert) {
        void options.sendAlert(fired).catch((error: unknown) => {
          logger?.warn(`cross-venue paper fire alert failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }

    for (const noEdge of result?.noEdge ?? []) {
      const pair = pairsById.get(noEdge.pairId);

      recordCrossVenueRejection({
        pair,
        pairId: noEdge.pairId,
        reason: noEdge.reason,
        rawEdge: noEdge.grossCents / 100,
        executableEdge: noEdge.netCents / 100,
        ruleScreen: "passed",
        ruleReview: reviewStatusOf(pair),
        nowMs,
      });
      rejected += 1;
      outcomes.set(noEdge.pairId, {
        status: "no_edge",
        ruleScreen: "passed",
        ruleScreenDetail: null,
        grossCents: noEdge.grossCents,
        netCents: noEdge.netCents,
        annualizedPct: null,
        executableSize: null,
      });
    }

    for (const rejection of result?.rejected ?? []) {
      const pair = pairsById.get(rejection.pairId);
      const reason = rejection.reason as RejectionReason;
      const ruleScreen = ruleScreenFromRejection(reason);

      recordCrossVenueRejection({
        pair,
        pairId: rejection.pairId,
        reason,
        rawEdge: null,
        executableEdge: null,
        ruleScreen,
        ruleReview: reviewStatusOf(pair),
        nowMs,
        detail: rejection.detail,
      });
      rejected += 1;
      outcomes.set(rejection.pairId, {
        status: "rejected",
        ruleScreen,
        ruleScreenDetail: rejection.detail ?? null,
        grossCents: null,
        netCents: null,
        annualizedPct: null,
        executableSize: null,
      });
    }

    // The pair board: one row per pair the lane looked at, with both
    // titles, both resolution times, the screen, the review and the last
    // numbers. A pair rejected at gate 1 keeps its numbers here as
    // information; its opportunity row carries none.
    for (const pair of pairs) {
      const outcome = outcomes.get(pair.id);
      const screen = screens.get(pair.id);

      upsertCrossVenuePair({
        pairId: pair.id,
        title: pair.title,
        kalshiTicker: pair.kalshi.ticker,
        polymarketSlug: pair.polymarket.slug,
        kalshiTitle: pair.kalshi.title ?? null,
        polymarketQuestion: pair.polymarket.question ?? null,
        category: pair.category ?? null,
        source: configuredIds.has(pair.id) ? "config" : "discovery",
        resolutionAtKalshi: pair.kalshi.expectedResolutionAt ?? null,
        resolutionAtPolymarket: pair.polymarket.expectedResolutionAt ?? null,
        ruleScreen: outcome?.ruleScreen ?? (screen ? screenStatusOf(screen.verdict) : null),
        ruleScreenDetail:
          outcome?.ruleScreenDetail ?? (screen && screen.reasons.length > 0 ? screen.reasons.join("; ") : null),
        ruleReview: reviewStatusOf(pair),
        review: reviewRecordOf(pair),
        kalshiRulesExcerpt: pair.kalshi.rulesText ?? null,
        polymarketRulesExcerpt: combineRules(pair.polymarket.rulesText, pair.polymarket.resolutionSource),
        lastGrossCents: outcome?.grossCents ?? null,
        lastNetCents: outcome?.netCents ?? null,
        lastAnnualizedPct: outcome?.annualizedPct ?? null,
        lastExecutableSize: outcome?.executableSize ?? null,
        lastStatus: outcome?.status ?? null,
        timestamp: nowMs,
      });
    }

    const mismatchCandidates = (discovery?.candidatePreview ?? [])
      .filter((candidate) => MISMATCH_STATUSES.has(candidate.status))
      .slice(0, options.maxMismatchRowsPerCycle ?? DEFAULT_MISMATCH_ROWS_PER_CYCLE);

    for (const candidate of mismatchCandidates) {
      const ruleScreen = ruleScreenFromRejection(candidate.status);

      recordOpportunity({
        strategy: CROSS_VENUE_ARB_STRATEGY,
        slug: candidate.polymarketSlug,
        title: candidate.polymarketQuestion || candidate.kalshiTitle,
        venues: ["kalshi", "polymarket"],
        category: candidate.category ?? null,
        rawEdge: null,
        status: "rejected",
        reason: candidate.status,
        gateFailed: gateForReason(candidate.status),
        ruleMatch: legacyRuleMatch(ruleScreen, "none"),
        ruleScreen,
        ruleReview: "none",
        tokenIds: [candidate.kalshiTicker, candidate.polymarketSlug],
        timestamp: nowMs,
        ...capitalLockTelemetry(candidate.expectedResolutionAt ?? null, nowMs),
      });
      upsertCrossVenuePair({
        pairId: `${candidate.kalshiTicker}|${candidate.polymarketSlug}`,
        title: candidate.polymarketQuestion || candidate.kalshiTitle,
        kalshiTicker: candidate.kalshiTicker,
        polymarketSlug: candidate.polymarketSlug,
        kalshiTitle: [candidate.kalshiTitle, candidate.kalshiSubtitle].filter(Boolean).join(" "),
        polymarketQuestion: candidate.polymarketQuestion,
        category: candidate.category ?? null,
        source: "discovery",
        resolutionAtPolymarket: candidate.expectedResolutionAt ?? null,
        ruleScreen,
        ruleScreenDetail: candidate.matchReason,
        ruleReview: "none",
        lastStatus: "rejected",
        timestamp: nowMs,
      });
      rejected += 1;
    }

    recordScannerRun({
      strategy: CROSS_VENUE_ARB_STRATEGY,
      timestamp: startedAt,
      rawOpportunities: pairs.length + mismatchCandidates.length,
      validatedOpportunities: validated,
      candidateOpportunities: candidates,
      rejectedOpportunities: rejected,
      dedupeSkips,
      paperTrades,
      durationMs: Math.max(0, now() - startedAt),
    });

    logger?.info(
      `Cross-venue cycle: ${pairs.length} pair(s), ${toScan.length} scanned against books, ${validated} validated, ${candidates} candidate(s), ${
        result?.noEdge.length ?? 0
      } without edge, ${rejected} rejected, ${
        mismatchCandidates.length
      } mismatch candidate(s), ${paperTrades} paper trade(s), ${dedupeSkips} dedupe skip(s).`,
    );

    return {
      success: true,
      pairsScanned: pairs.length,
      opportunities: validated,
      candidates,
      noEdge: result?.noEdge.length ?? 0,
      paperTrades,
      dedupeSkips,
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
      candidates: 0,
      noEdge: 0,
      rejectedPairs: 0,
      paperTrades: 0,
      dedupeSkips: 0,
      mismatchCandidates: 0,
      error: message,
    };
  }
}

/** The review a person recorded in the pair config, or `none`. */
export function reviewStatusOf(pair: CrossVenuePair | undefined): RuleReviewStatus {
  const verdict = pair?.review?.verdict;

  return verdict === "equivalent" || verdict === "not_equivalent" || verdict === "pending"
    ? verdict
    : "none";
}

function reviewRecordOf(pair: CrossVenuePair | undefined): CrossVenuePairReviewRecord | null {
  return pair?.review ? { ...pair.review } : null;
}

/** The screen's neutral verdict as the journal's rule_screen status. */
function screenStatusOf(verdict: ReturnType<typeof screenTitlePair>["verdict"]): RuleScreenStatus {
  return verdict;
}

function emptyOutcome(
  status: OpportunityStatus,
  ruleScreen: RuleScreenStatus | null,
  detail: string | null,
): PairOutcome {
  return {
    status,
    ruleScreen,
    ruleScreenDetail: detail,
    grossCents: null,
    netCents: null,
    annualizedPct: null,
    executableSize: null,
  };
}

function combineRules(rules: string | undefined, source: string | undefined): string | null {
  const parts = [rules, source ? `Resolution source: ${source}` : ""].filter(
    (part): part is string => Boolean(part && part.trim()),
  );

  return parts.length === 0 ? null : parts.join(" ");
}

function outcomeOf(
  status: OpportunityStatus,
  ruleScreen: RuleScreenStatus,
  detail: string | null,
  opportunity: CrossVenueArbOpportunity,
): PairOutcome {
  return {
    status,
    ruleScreen,
    ruleScreenDetail: detail,
    grossCents: opportunity.grossCents,
    netCents: opportunity.netCents,
    annualizedPct: opportunity.annualizedPct,
    executableSize: opportunity.executableSize,
  };
}

function journalCrossVenueOpportunity(
  opportunity: CrossVenueArbOpportunity,
  pair: CrossVenuePair | undefined,
  nowMs: number,
  outcome: {
    status: OpportunityStatus;
    reason: string;
    ruleReview: RuleReviewStatus;
  },
): string {
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
    netProfitUsd: opportunity.maxProfitDollars,
    annualizedPct: opportunity.annualizedPct,
    ruleMatch: legacyRuleMatch("passed", outcome.ruleReview),
    ruleScreen: "passed",
    ruleReview: outcome.ruleReview,
    gateFailed: outcome.status === "rejected" ? gateForReason(outcome.reason) : null,
    resolutionAtKalshi: pair?.kalshi.expectedResolutionAt ?? null,
    resolutionAtPolymarket: pair?.polymarket.expectedResolutionAt ?? null,
    status: outcome.status,
    reason: outcome.reason,
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

  return record.id;
}


/**
 * The two paper legs of a reviewed cross-venue basket: shares are the
 * smaller of the executable size and what the target capital buys at the
 * top-of-book sum, each leg priced at its average fill. The Kalshi leg is
 * journaled under kalshi:<ticker> with the ticker and side as its token, so
 * the resolution loop settles it against Kalshi's market result; the
 * Polymarket leg carries its slug and CLOB token.
 */
function crossVenuePaperLegs(
  opportunity: CrossVenueArbOpportunity,
  pair: CrossVenuePair,
  paperSizeUsd: number,
): CrossVenuePaperLeg[] | null {
  if (!(opportunity.totalTopOfBookCost > 0)) {
    return null;
  }

  const shares = roundShares(
    Math.min(opportunity.executableSize, paperSizeUsd / opportunity.totalTopOfBookCost),
  );

  if (!(shares > 0)) {
    return null;
  }

  const legs: CrossVenuePaperLeg[] = [];

  for (const leg of [opportunity.yesLeg, opportunity.noLeg]) {
    const price = leg.averageFillPrice;

    if (!(price > 0 && price <= 1)) {
      return null;
    }

    const polymarketTokenId =
      leg.side === "YES" ? pair.polymarket.yesTokenId : pair.polymarket.noTokenId;
    const kalshi = leg.venue === "kalshi";

    if (!kalshi && !polymarketTokenId?.trim()) {
      return null;
    }

    legs.push({
      strategy: CROSS_VENUE_ARB_STRATEGY,
      slug: kalshi ? kalshiPaperSlug(pair.kalshi.ticker) : pair.polymarket.slug,
      question: opportunity.title,
      tokenId: kalshi ? `${pair.kalshi.ticker}:${leg.side}` : polymarketTokenId,
      side: leg.side,
      entryPrice: price,
      paperSizeUsd: roundUsd(shares * price),
      paperSizeShares: shares,
      arbClass: CROSS_VENUE_ARB_STRATEGY,
    });
  }

  return legs;
}

function roundShares(value: number): number {
  return Math.round(value * 100) / 100;
}
function recordCrossVenueRejection(input: {
  pair: CrossVenuePair | undefined;
  pairId: string;
  reason: RejectionReason;
  rawEdge: number | null;
  executableEdge: number | null;
  ruleScreen: RuleScreenStatus | null;
  ruleReview: RuleReviewStatus;
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
    gateFailed: gateForReason(input.reason),
    ruleMatch: legacyRuleMatch(input.ruleScreen, input.ruleReview),
    ruleScreen: input.ruleScreen,
    ruleReview: input.ruleReview,
    resolutionAtKalshi: pair?.kalshi.expectedResolutionAt ?? null,
    resolutionAtPolymarket: pair?.polymarket.expectedResolutionAt ?? null,
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
