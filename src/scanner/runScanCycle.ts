import { executeOrPaper } from "../execution/executeOrPaper.js";
import {
  recordOpportunity,
  updateOpportunityStatus,
  type OpportunityTelemetryInput,
} from "../execution/opportunityJournal.js";
import { recordOpportunityLegs } from "../execution/opportunityLegJournal.js";
import { recordOrderBookSnapshot } from "../execution/orderbookSnapshotJournal.js";
import {
  buildPaperFireDedupeKey,
  getRecentPaperFire,
  recordPaperDedupeSkip,
  recordPaperFire,
} from "../execution/paperDedupe.js";
import { recordScanCycle } from "../execution/scanCycleJournal.js";
import { recordScannerRun } from "../execution/scannerRunJournal.js";
import {
  computeBasketEconomics,
  DEFAULT_MIN_ANNUALIZED_NET_PCT,
  isPositiveBps,
  meetsAnnualizedHurdle,
  type BasketEconomics,
} from "../core/opportunityEconomics.js";
import {
  createRejectionCounter,
  gateForReason,
  type RejectionCounter,
  type RejectionReason,
} from "../core/rejectionReasons.js";
import { legacyRuleMatch } from "../core/taxonomy.js";
import type { ExecutionRoleMode } from "../core/venueFees.js";
import {
  addOpportunitiesFound,
  addPaperTrades,
  incrementErrors,
  incrementScanCycles,
  observeScanCycleDuration,
} from "../utils/metrics.js";
import {
  formatStructuredError,
  logError,
  logInfo,
  logWarn,
} from "../utils/logger.js";
import { type NegRiskBracketOpportunity } from "./negRiskBracketScanner.js";
import {
  evaluateCleanNegRiskBasket,
  DEFAULT_CLEAN_BASKET_FILTER_OPTIONS,
  type CleanBasketFilterOptions,
} from "./cleanBasketFilter.js";
import { classifyNegRiskPayoffStructure } from "./negRiskBasketClassifier.js";
import { scanNegRiskCombinedArbs } from "./negRiskSnapshotScanner.js";
import {
  validateNegRiskOpportunity,
  validateWithinMarketOpportunity,
  type ValidatedNegRiskOpportunity,
  type ValidatedWithinMarketOpportunity,
} from "./opportunityValidator.js";
import {
  DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD,
  scanWithinMarketCombinedOpportunities,
  WITHIN_MARKET_FAST_ARB_STRATEGY,
  type WithinMarketArbOpportunity,
} from "./withinMarketArbScanner.js";
import {
  CLEAR_WIN_WATCH_REASON,
  CLEAR_WIN_WATCH_STRATEGY,
  type ClearWinWatchOpportunity,
} from "./clearWinWatchScanner.js";
import type { NegRiskBasketSizingLeg } from "./basketSizing.js";
import {
  classifyCapitalLock,
  type CapitalLockClass,
} from "../utils/marketTime.js";

export const NEG_RISK_BRACKET_STRATEGY = "neg_risk_bracket_arb";
/**
 * Reason text of a `candidate` row: structurally clean, executable, net
 * positive and above the hurdle, but locked past the short-arb window. It is
 * a class, not a rejection, and never paper-fires (decision E2).
 */
export const CARRY_CANDIDATE_REASON = "carry_candidate";
const DEFAULT_PAPER_SIZE_USD = 1;
const DEFAULT_MIN_PAPER_FIRE_EDGE = 0;
const DEFAULT_MIN_EXECUTABLE_DEPTH_USD = 0;
const DEFAULT_MAX_OPPORTUNITIES_PER_STRATEGY = 50;
const SCANNER_WARNING_LIMIT_PER_CYCLE = 8;
const VALIDATION_WARNING_LIMIT_PER_CYCLE = 12;
export const DEFAULT_PAPER_FIRE_COOLDOWN_MS = 21_600_000;

export type ScanCycleLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type ScanCycleResult = {
  success: boolean;
  opportunities: number;
  paperTrades: number;
  skippedDuplicates: number;
  rejectedOpportunities: number;
  /** Carry candidates: clean and above the hurdle, but not fireable. */
  candidateOpportunities: number;
  /** Watch-band candidates with no gross edge at the quote or the book. */
  nearMissOpportunities: number;
  rejectionsByReason: Partial<Record<RejectionReason, number>>;
  error?: string;
};

export type RunScanCycleOptions = {
  scanner?: () => Promise<NegRiskBracketOpportunity[]>;
  withinMarketScanner?: (options?: {
    threshold?: number;
  }) => Promise<WithinMarketArbOpportunity[]>;
  clearWinWatchScanner?: () => Promise<ClearWinWatchOpportunity[]>;
  execute?: typeof executeOrPaper;
  logger?: ScanCycleLogger;
  cleanBasketFilterOptions?: Partial<CleanBasketFilterOptions>;
  /** Capital the paper basket targets; the book decides what it actually gets. */
  paperSizeUsd?: number;
  paperFireCooldownMs?: number;
  minPaperFireEdge?: number;
  /** Baskets whose executable capital is below this are not chances. */
  minExecutableDepthUsd?: number;
  /** How legs are priced for fees: every leg taker, or one resting maker. */
  roleMode?: ExecutionRoleMode;
  /**
   * Annualised net return, in percent, a basket must clear to be a chance
   * or a carry candidate (MIN_ANNUALIZED_NET_PCT, decision E1).
   */
  hurdlePct?: number;
  maxOpportunitiesPerStrategy?: number;
  now?: () => number;
  validateOpportunity?: (
    opportunity: NegRiskBracketOpportunity,
    targetSizeUsd: number,
  ) => Promise<ValidatedNegRiskOpportunity>;
  validateWithinMarket?: (
    opportunity: WithinMarketArbOpportunity,
    targetSizeUsd: number,
  ) => Promise<ValidatedWithinMarketOpportunity>;
  sendAlert?: (message: string) => Promise<unknown>;
};

const defaultLogger: ScanCycleLogger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
};

export async function runScanCycle(
  options: RunScanCycleOptions = {},
): Promise<ScanCycleResult> {
  incrementScanCycles();
  const cycleStartedAt = Date.now();

  const scanner = options.scanner;
  const withinMarketScanner =
    options.withinMarketScanner ?? scanWithinMarketCombinedOpportunities;
  const clearWinWatchScanner =
    options.clearWinWatchScanner ?? (async () => []);
  const execute = options.execute ?? executeOrPaper;
  const logger = options.logger ?? defaultLogger;
  const paperSizeUsd = options.paperSizeUsd ?? DEFAULT_PAPER_SIZE_USD;
  const minPaperFireEdge =
    options.minPaperFireEdge ?? DEFAULT_MIN_PAPER_FIRE_EDGE;
  const minExecutableDepthUsd =
    options.minExecutableDepthUsd ?? DEFAULT_MIN_EXECUTABLE_DEPTH_USD;
  const roleMode = options.roleMode ?? "taker";
  const maxOpportunitiesPerStrategy =
    options.maxOpportunitiesPerStrategy ??
    DEFAULT_MAX_OPPORTUNITIES_PER_STRATEGY;
  const paperFireCooldownMs =
    options.paperFireCooldownMs ?? DEFAULT_PAPER_FIRE_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  const validateOpportunity =
    options.validateOpportunity ?? validateNegRiskOpportunity;
  const validateWithinMarket =
    options.validateWithinMarket ?? validateWithinMarketOpportunity;
  const cleanBasketFilterOptions = options.cleanBasketFilterOptions;
  const sendAlert = options.sendAlert;
  const hurdlePct = options.hurdlePct ?? DEFAULT_MIN_ANNUALIZED_NET_PCT;
  const maxShortDurationHours =
    cleanBasketFilterOptions?.maxShortDurationHours ??
    DEFAULT_CLEAN_BASKET_FILTER_OPTIONS.maxShortDurationHours;
  const rejections = createRejectionCounter();

  try {
    const negRiskWarningLimiter = createCycleWarningLimiter(
      logger,
      "NEG_RISK scanner",
      SCANNER_WARNING_LIMIT_PER_CYCLE,
    );
    const validationWarningLimiter = createCycleWarningLimiter(
      logger,
      "paper validation",
      VALIDATION_WARNING_LIMIT_PER_CYCLE,
    );
    const validationLogger = {
      ...logger,
      warn: validationWarningLimiter.warn,
    };
    const [negRiskScan, withinMarketScan, clearWinWatchScan] = await Promise.all([
      runMeasuredScanner(() =>
        scanner
          ? scanner()
          : scanNegRiskCombinedArbs({ warn: negRiskWarningLimiter.warn }),
      ),
      runMeasuredScanner(() =>
        withinMarketScanner({
          threshold: DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD,
        }),
      ),
      runMeasuredScanner(() => clearWinWatchScanner()),
    ]);
    negRiskWarningLimiter.flush();
    recordScannerErrors({
      cycleStartedAt,
      clearWinWatchScan,
      negRiskScan,
      withinMarketScan,
    });

    if (negRiskScan.error || withinMarketScan.error || clearWinWatchScan.error) {
      throw new Error(
        [negRiskScan.error, withinMarketScan.error, clearWinWatchScan.error]
          .filter((error): error is string => typeof error === "string")
          .join("; "),
      );
    }

    const rawNegRiskOpportunities = negRiskScan.opportunities;
    const rawWithinMarketOpportunities = withinMarketScan.opportunities;
    const rawClearWinWatchOpportunities = clearWinWatchScan.opportunities;
    const opportunities = rawNegRiskOpportunities.slice(
      0,
      maxOpportunitiesPerStrategy,
    );
    const withinMarketOpportunities = rawWithinMarketOpportunities.slice(
      0,
      maxOpportunitiesPerStrategy,
    );
    // "raw" is a candidate with a gross edge at the quote. The watch band
    // above 1.00 is scanned too, because a stale quote can hide a book that
    // does show an edge, but it is counted as a near miss and journaled
    // only when the book promotes it.
    const withinMarketQuoteRawCount = rawWithinMarketOpportunities.filter(
      isRawAtQuote,
    ).length;
    const withinMarketNearMissCount =
      rawWithinMarketOpportunities.length - withinMarketQuoteRawCount;
    addOpportunitiesFound(
      rawNegRiskOpportunities.length +
        rawWithinMarketOpportunities.length +
        rawClearWinWatchOpportunities.length,
    );
    logger.info(
      formatOpportunityCount(
        "NEG_RISK bracket opportunities",
        rawNegRiskOpportunities.length,
        opportunities.length,
      ),
    );
    logger.info(
      `${formatOpportunityCount(
        "Within-market opportunities",
        withinMarketQuoteRawCount,
        Math.min(withinMarketQuoteRawCount, withinMarketOpportunities.length),
      )}; near misses in the watch band: ${withinMarketNearMissCount}`,
    );
    logger.info(`Clear-win-watch diagnostics: ${rawClearWinWatchOpportunities.length}`);

    let paperTrades = 0;
    let skippedDuplicates = 0;
    let rejectedOpportunities = 0;
    let negRiskPaperTrades = 0;
    let negRiskValidatedOpportunities = 0;
    let negRiskCandidateOpportunities = 0;
    let negRiskRejectedOpportunities = 0;
    let negRiskDedupeSkips = 0;
    let withinMarketPaperTrades = 0;
    let withinMarketValidatedOpportunities = 0;
    let withinMarketCandidateOpportunities = 0;
    let withinMarketRejectedOpportunities = 0;
    let withinMarketDedupeSkips = 0;
    let withinMarketPromotedNearMisses = 0;
    let clearWinWatchRejectedOpportunities = 0;

    for (const opportunity of rawClearWinWatchOpportunities.slice(
      0,
      maxOpportunitiesPerStrategy,
    )) {
      recordOpportunity({
        strategy: CLEAR_WIN_WATCH_STRATEGY,
        slug: opportunity.slug,
        title: opportunity.slug,
        venues: ["polymarket"],
        rawEdge: null,
        status: "rejected",
        reason: rejections.record(CLEAR_WIN_WATCH_REASON),
        tokenIds: [opportunity.tokenId],
        timestamp: now(),
        expectedResolutionAt: opportunity.expectedResolutionAt,
        durationHours: opportunity.durationHours,
        capitalLockClass: opportunity.capitalLockClass,
      });
      rejectedOpportunities += 1;
      clearWinWatchRejectedOpportunities += 1;
    }

    for (const opportunity of opportunities) {
      const dedupeKey = buildOpportunityDedupeKey(opportunity);
      const nowMs = now();
      const tokenIds = getPaperTokenIds(opportunity);
      const recentFire = getRecentPaperFire(
        dedupeKey,
        nowMs,
        paperFireCooldownMs,
      );

      if (recentFire) {
        recordPaperDedupeSkip({
          dedupeKey,
          strategy: NEG_RISK_BRACKET_STRATEGY,
          slug: opportunity.eventSlug,
          threshold: opportunity.threshold,
          tokenIds,
          previousFireAt: recentFire.fired_at,
          skippedAt: nowMs,
          cooldownMs: paperFireCooldownMs,
        });
        logger.info("skipped duplicate paper opportunity.");
        skippedDuplicates += 1;
        negRiskDedupeSkips += 1;
        continue;
      }

      const journaledOpportunity = recordOpportunity({
        strategy: NEG_RISK_BRACKET_STRATEGY,
        slug: opportunity.eventSlug,
        title: opportunity.eventSlug,
        venues: ["polymarket"],
        rawEdge: opportunity.expectedEdge,
        status: "raw_found",
        reason: opportunity.reason,
        tokenIds,
        timestamp: nowMs,
        ...buildTimingTelemetry(opportunity.expectedResolutionAt, nowMs),
      });

      // Gate 1: identity and structure. A basket whose legs are not
      // mutually exclusive is not a basket, whatever its horizon or its
      // quoted edge; it is rejected for the structural reason and carries
      // no return figures, because those would be computed on a payout
      // that does not exist.
      const payoff = classifyNegRiskPayoffStructure({
        eventSlug: opportunity.eventSlug,
        legs: opportunity.legs,
        negRisk: opportunity.negRisk ?? null,
      });

      if (payoff !== "clean") {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...buildTimingTelemetry(opportunity.expectedResolutionAt, nowMs),
          legCount: opportunity.legs.length,
          reason: rejections.record(payoff),
          gateFailed: gateForReason(payoff),
        });
        validationWarningLimiter.warn(
          `skipped invalid paper opportunity: ${payoff}.`,
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
        continue;
      }

      // A market past its expected resolution time is settled or settling;
      // nothing on its book fills a basket. The May 2026 journal holds 98
      // paper fills on markets that had already closed.
      if (isPastExpectedResolution(opportunity.expectedResolutionAt, nowMs)) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...buildTimingTelemetry(opportunity.expectedResolutionAt, nowMs),
          legCount: opportunity.legs.length,
          reason: rejections.record("past_expected_resolution"),
          gateFailed: gateForReason("past_expected_resolution"),
        });
        validationWarningLimiter.warn(
          "skipped invalid paper opportunity: past_expected_resolution.",
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
        continue;
      }

      // Gate 2: executability, priced against the books that would fill it.
      const validated = await validateOpportunity(opportunity, paperSizeUsd);
      const executableEdge = validated.expectedGrossEdge;
      const economics = buildNegRiskEconomics(validated, opportunity, {
        nowMs,
        roleMode,
      });
      const telemetry = {
        ...buildValidationTelemetry(validated),
        ...buildEconomicsTelemetry(economics, validated.minLegDepthUsd),
        ...buildTimingTelemetry(opportunity.expectedResolutionAt, nowMs),
        ruleScreen: "passed" as const,
        ruleMatch: legacyRuleMatch("passed", null),
      };
      recordNegRiskLegTelemetry({
        economics,
        nowMs,
        opportunity,
        opportunityId: journaledOpportunity.id,
        validated,
      });

      const reject = (reason: RejectionReason): void => {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...telemetry,
          reason: rejections.record(reason),
          gateFailed: gateForReason(reason),
        });
        validationWarningLimiter.warn(
          `skipped invalid paper opportunity: ${reason}.`,
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
      };

      if (!validated.valid) {
        reject(validated.reason as RejectionReason);
        continue;
      }

      if (executableEdge === null || executableEdge <= minPaperFireEdge) {
        reject("non_positive_executable_edge");
        continue;
      }

      if (validated.legs.some((leg) => leg.averageFillPrice === null)) {
        reject("missing_fill_price");
        continue;
      }

      // Gate 3: economics at the executable size, net of both fee curves.
      if (economics && !isPositiveBps(economics.executableNetEdgeBps)) {
        reject("non_positive_net_edge_after_fees");
        continue;
      }

      if (economics && economics.capitalUsd < minExecutableDepthUsd) {
        reject("insufficient_depth_for_target_size");
        continue;
      }

      const cleanBasket = evaluateCleanNegRiskBasket(
        opportunity,
        validated,
        {
          ...cleanBasketFilterOptions,
          enabled: true,
          nowMs,
          checkPayoffStructure: false,
          checkDuration: false,
        },
      );

      if (!cleanBasket.valid) {
        reject(cleanBasket.reason as RejectionReason);
        continue;
      }

      // Gate 4: horizon. Once the hurdle is met the capital lock is a class,
      // not a rejection: short fires, medium and long are carry candidates.
      const horizon = classifyHorizon({
        expectedResolutionAt: opportunity.expectedResolutionAt,
        nowMs,
        annualizedPct: economics?.annualizedPct ?? null,
        hurdlePct,
        maxShortDurationHours,
      });

      if (horizon.reject) {
        reject(horizon.reject);
        continue;
      }

      if (!horizon.fireable) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "candidate",
          ...telemetry,
          reason: CARRY_CANDIDATE_REASON,
        });
        negRiskCandidateOpportunities += 1;
        continue;
      }

      updateOpportunityStatus(journaledOpportunity.id, {
        status: "validated",
        ...telemetry,
        reason: cleanBasket.reason,
      });
      negRiskValidatedOpportunities += 1;

      for (const leg of validated.legs) {
        const paperLegSizing = getNegRiskPaperLegSizing(
          validated,
          leg.tokenId,
          paperSizeUsd,
        );
        const entryPrice = paperLegSizing.entryPrice;

        if (entryPrice === null) {
          throw new Error("Validated opportunity is missing a fill price.");
        }

        execute({
          strategy: NEG_RISK_BRACKET_STRATEGY,
          slug: leg.slug,
          question: leg.question,
          tokenId: leg.tokenId,
          opportunityId: journaledOpportunity.id,
          side: leg.sideToPaperTrade,
          entryPrice,
          paperSizeUsd: paperLegSizing.paperSizeUsd,
          paperSizeShares: paperLegSizing.paperSizeShares,
          arbClass: NEG_RISK_BRACKET_STRATEGY,
        });
        paperTrades += 1;
        negRiskPaperTrades += 1;
      }

      recordPaperFire({
        dedupeKey,
        strategy: NEG_RISK_BRACKET_STRATEGY,
        eventSlug: opportunity.eventSlug,
        firedAt: nowMs,
      });
      updateOpportunityStatus(journaledOpportunity.id, {
        status: "paper_fired",
        ...telemetry,
        reason: "paper_trade_recorded",
      });
      await sendPaperFireAlert({
        executableEdge,
        logger: validationLogger,
        paperTrades: validated.legs.length,
        sendAlert,
        slug: opportunity.eventSlug,
        strategy: NEG_RISK_BRACKET_STRATEGY,
      });
    }

    for (const opportunity of withinMarketOpportunities) {
      const result = await processWithinMarketOpportunity({
        execute,
        logger: validationLogger,
        minExecutableDepthUsd,
        nowMs: now(),
        opportunity,
        nearMiss: !isRawAtQuote(opportunity),
        paperFireCooldownMs,
        paperSizeUsd,
        rejections,
        roleMode,
        sendAlert,
        validateWithinMarket,
        minPaperFireEdge,
        hurdlePct,
        maxShortDurationHours,
      });

      paperTrades += result.paperTrades;
      skippedDuplicates += result.skippedDuplicates;
      rejectedOpportunities += result.rejectedOpportunities;
      withinMarketPaperTrades += result.paperTrades;
      withinMarketValidatedOpportunities += result.validatedOpportunities;
      withinMarketCandidateOpportunities += result.candidateOpportunities;
      withinMarketRejectedOpportunities += result.rejectedOpportunities;
      withinMarketDedupeSkips += result.skippedDuplicates;
      withinMarketPromotedNearMisses += result.promotedNearMisses;
    }

    const withinMarketNearMissesLeft =
      withinMarketNearMissCount - withinMarketPromotedNearMisses;

    recordScannerRun({
      strategy: NEG_RISK_BRACKET_STRATEGY,
      timestamp: cycleStartedAt,
      rawOpportunities: rawNegRiskOpportunities.length,
      validatedOpportunities: negRiskValidatedOpportunities,
      candidateOpportunities: negRiskCandidateOpportunities,
      rejectedOpportunities: negRiskRejectedOpportunities,
      dedupeSkips: negRiskDedupeSkips,
      paperTrades: negRiskPaperTrades,
      durationMs: negRiskScan.durationMs,
    });
    recordScannerRun({
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      timestamp: cycleStartedAt,
      rawOpportunities: withinMarketQuoteRawCount + withinMarketPromotedNearMisses,
      nearMissOpportunities: withinMarketNearMissesLeft,
      validatedOpportunities: withinMarketValidatedOpportunities,
      candidateOpportunities: withinMarketCandidateOpportunities,
      rejectedOpportunities: withinMarketRejectedOpportunities,
      dedupeSkips: withinMarketDedupeSkips,
      paperTrades: withinMarketPaperTrades,
      durationMs: withinMarketScan.durationMs,
    });
    recordScannerRun({
      strategy: CLEAR_WIN_WATCH_STRATEGY,
      timestamp: cycleStartedAt,
      rawOpportunities: rawClearWinWatchOpportunities.length,
      validatedOpportunities: 0,
      rejectedOpportunities: clearWinWatchRejectedOpportunities,
      dedupeSkips: 0,
      paperTrades: 0,
      durationMs: clearWinWatchScan.durationMs,
    });

    addPaperTrades(paperTrades);

    const result: ScanCycleResult = {
      success: true,
      opportunities:
        rawNegRiskOpportunities.length +
        rawWithinMarketOpportunities.length +
        rawClearWinWatchOpportunities.length,
      paperTrades,
      skippedDuplicates,
      rejectedOpportunities,
      candidateOpportunities:
        negRiskCandidateOpportunities + withinMarketCandidateOpportunities,
      nearMissOpportunities: withinMarketNearMissesLeft,
      rejectionsByReason: rejections.counts(),
    };

    validationWarningLimiter.flush();
    recordScanCycle(result);
    observeScanCycleDuration(Date.now() - cycleStartedAt);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    incrementErrors();
    logger.error(
      formatStructuredError("scan_cycle_failed", error, {
        component: "scanner",
      }),
    );

    const result: ScanCycleResult = {
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      candidateOpportunities: 0,
      nearMissOpportunities: 0,
      rejectionsByReason: rejections.counts(),
      error: message,
    };

    recordScanCycle(result);
    observeScanCycleDuration(Date.now() - cycleStartedAt);

    return result;
  }
}

function buildOpportunityDedupeKey(
  opportunity: NegRiskBracketOpportunity,
): string {
  return buildPaperFireDedupeKey({
    strategy: NEG_RISK_BRACKET_STRATEGY,
    eventSlug: opportunity.eventSlug,
    threshold: opportunity.threshold,
    tokenIds: opportunity.legs.map((leg) => leg.noTokenId),
  });
}

function getPaperTokenIds(opportunity: NegRiskBracketOpportunity): string[] {
  return opportunity.legs.map((leg) => leg.noTokenId);
}

function formatOpportunityCount(
  label: string,
  rawCount: number,
  processedCount: number,
): string {
  return rawCount === processedCount
    ? `${label}: ${rawCount}`
    : `${label}: ${rawCount} (processing top ${processedCount})`;
}

function createCycleWarningLimiter(
  logger: ScanCycleLogger,
  label: string,
  limit: number,
): { warn: (message: string) => void; flush: () => void } {
  let shown = 0;
  let suppressed = 0;

  return {
    warn(message: string): void {
      if (shown < limit) {
        logger.warn(message);
        shown += 1;
        return;
      }

      suppressed += 1;
    },
    flush(): void {
      if (suppressed > 0) {
        logger.warn(
          `${label}: suppressed ${suppressed} additional warning(s) this cycle.`,
        );
      }
    },
  };
}

type ProcessWithinMarketOpportunityInput = {
  execute: typeof executeOrPaper;
  logger: ScanCycleLogger;
  minExecutableDepthUsd: number;
  nowMs: number;
  opportunity: WithinMarketArbOpportunity;
  /** The quote showed no gross edge; only the book can make this a row. */
  nearMiss: boolean;
  paperFireCooldownMs: number;
  paperSizeUsd: number;
  minPaperFireEdge: number;
  rejections: RejectionCounter;
  roleMode: ExecutionRoleMode;
  hurdlePct: number;
  maxShortDurationHours: number;
  sendAlert?: (message: string) => Promise<unknown>;
  validateWithinMarket: (
    opportunity: WithinMarketArbOpportunity,
    targetSizeUsd: number,
  ) => Promise<ValidatedWithinMarketOpportunity>;
};

type ProcessOpportunityResult = {
  paperTrades: number;
  skippedDuplicates: number;
  rejectedOpportunities: number;
  validatedOpportunities: number;
  candidateOpportunities: number;
  /** Near misses whose book showed an edge; they count as raw. */
  promotedNearMisses: number;
};

const EMPTY_PROCESS_RESULT: ProcessOpportunityResult = {
  paperTrades: 0,
  skippedDuplicates: 0,
  rejectedOpportunities: 0,
  validatedOpportunities: 0,
  candidateOpportunities: 0,
  promotedNearMisses: 0,
};

async function processWithinMarketOpportunity(
  input: ProcessWithinMarketOpportunityInput,
): Promise<ProcessOpportunityResult> {
  const tokenIds = [
    input.opportunity.tokenIds.yes,
    input.opportunity.tokenIds.no,
  ];
  const dedupeKey = buildPaperFireDedupeKey({
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    eventSlug: input.opportunity.slug,
    threshold: DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD,
    tokenIds,
  });
  const recentFire = getRecentPaperFire(
    dedupeKey,
    input.nowMs,
    input.paperFireCooldownMs,
  );

  if (recentFire) {
    recordPaperDedupeSkip({
      dedupeKey,
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      slug: input.opportunity.slug,
      threshold: DEFAULT_WITHIN_MARKET_WATCH_THRESHOLD,
      tokenIds,
      previousFireAt: recentFire.fired_at,
      skippedAt: input.nowMs,
      cooldownMs: input.paperFireCooldownMs,
    });
    input.logger.info("skipped duplicate paper opportunity.");

    return { ...EMPTY_PROCESS_RESULT, skippedDuplicates: 1 };
  }

  // A market past its expected resolution time is settled or settling: no
  // quote on it is a fill. A near miss on such a market is not even a row.
  if (
    isPastExpectedResolution(
      input.opportunity.expectedResolutionAt ?? null,
      input.nowMs,
    )
  ) {
    if (input.nearMiss) {
      return EMPTY_PROCESS_RESULT;
    }

    const pastOpportunity = recordOpportunity({
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      slug: input.opportunity.slug,
      title: input.opportunity.question,
      venues: ["polymarket"],
      category: input.opportunity.category ?? null,
      rawEdge: input.opportunity.expectedEdge,
      status: "raw_found",
      reason: input.opportunity.reason,
      tokenIds,
      timestamp: input.nowMs,
      ...buildTimingTelemetry(input.opportunity.expectedResolutionAt ?? null, input.nowMs),
      ruleScreen: "structural",
      ruleMatch: legacyRuleMatch("structural", null),
    });
    updateOpportunityStatus(pastOpportunity.id, {
      status: "rejected",
      ...buildTimingTelemetry(input.opportunity.expectedResolutionAt ?? null, input.nowMs),
      reason: input.rejections.record("past_expected_resolution"),
      gateFailed: gateForReason("past_expected_resolution"),
    });
    input.logger.warn(
      "skipped invalid paper opportunity: past_expected_resolution.",
    );

    return { ...EMPTY_PROCESS_RESULT, rejectedOpportunities: 1 };
  }

  // Gate 1 is trivial for one contract: YES and NO of the same market pay
  // exactly one dollar together by construction. Gate 2 comes before the
  // journal entry so that a near miss, a quote without an edge, becomes a
  // row only when the book actually shows one.
  const validated = await input.validateWithinMarket(
    input.opportunity,
    input.paperSizeUsd,
  );
  const executableEdge = validated.expectedGrossEdge;

  if (input.nearMiss && (executableEdge === null || executableEdge <= 0)) {
    return EMPTY_PROCESS_RESULT;
  }

  const promotedNearMisses = input.nearMiss ? 1 : 0;
  const journaledOpportunity = recordOpportunity({
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    slug: input.opportunity.slug,
    title: input.opportunity.question,
    venues: ["polymarket"],
    category: input.opportunity.category ?? null,
    rawEdge: input.opportunity.expectedEdge,
    status: "raw_found",
    reason: input.opportunity.reason,
    tokenIds,
    timestamp: input.nowMs,
    ...buildTimingTelemetry(input.opportunity.expectedResolutionAt ?? null, input.nowMs),
    ruleScreen: "structural",
    ruleMatch: legacyRuleMatch("structural", null),
  });

  const economics = buildWithinMarketEconomics(validated, input.opportunity, {
    nowMs: input.nowMs,
    roleMode: input.roleMode,
  });
  const telemetry = {
    ...buildValidationTelemetry(validated),
    ...buildEconomicsTelemetry(economics, validated.minLegDepthUsd),
    ...buildTimingTelemetry(input.opportunity.expectedResolutionAt ?? null, input.nowMs),
    ruleScreen: "structural" as const,
    ruleMatch: legacyRuleMatch("structural", null),
  };
  recordWithinMarketLegTelemetry({
    economics,
    nowMs: input.nowMs,
    opportunity: input.opportunity,
    opportunityId: journaledOpportunity.id,
    validated,
  });

  const rejected = (reason: RejectionReason): ProcessOpportunityResult => {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      ...telemetry,
      reason: input.rejections.record(reason),
      gateFailed: gateForReason(reason),
    });
    input.logger.warn(`skipped invalid paper opportunity: ${reason}.`);

    return { ...EMPTY_PROCESS_RESULT, rejectedOpportunities: 1, promotedNearMisses };
  };

  if (!validated.valid) {
    return rejected(validated.reason as RejectionReason);
  }

  if (
    executableEdge === null ||
    executableEdge <= input.minPaperFireEdge ||
    validated.askYes === null ||
    validated.askNo === null
  ) {
    return rejected("non_positive_executable_edge");
  }

  if (withinMarketSpreadBps(validated) > DEFAULT_CLEAN_BASKET_FILTER_OPTIONS.maxLegSpreadBps) {
    return rejected("wide_leg_spread");
  }

  // Gate 3: economics at the executable size, net of the fee curve.
  if (economics && !isPositiveBps(economics.executableNetEdgeBps)) {
    return rejected("non_positive_net_edge_after_fees");
  }

  if (economics && economics.capitalUsd < input.minExecutableDepthUsd) {
    return rejected("insufficient_depth_for_target_size");
  }

  // Gate 4: horizon, a class once the hurdle is met.
  const horizon = classifyHorizon({
    expectedResolutionAt: input.opportunity.expectedResolutionAt ?? null,
    nowMs: input.nowMs,
    annualizedPct: economics?.annualizedPct ?? null,
    hurdlePct: input.hurdlePct,
    maxShortDurationHours: input.maxShortDurationHours,
  });

  if (horizon.reject) {
    return rejected(horizon.reject);
  }

  if (!horizon.fireable) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "candidate",
      ...telemetry,
      reason: CARRY_CANDIDATE_REASON,
    });

    return { ...EMPTY_PROCESS_RESULT, candidateOpportunities: 1, promotedNearMisses };
  }

  updateOpportunityStatus(journaledOpportunity.id, {
    status: "validated",
    ...telemetry,
    reason: validated.reason,
  });

  const shares = validated.executableShares && validated.executableShares > 0
    ? validated.executableShares
    : 1;

  input.execute({
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    slug: input.opportunity.slug,
    question: input.opportunity.question,
    tokenId: input.opportunity.tokenIds.yes,
    opportunityId: journaledOpportunity.id,
    side: "YES",
    entryPrice: validated.askYes,
    paperSizeUsd: roundUsd(validated.askYes * shares),
    paperSizeShares: shares,
    arbClass: WITHIN_MARKET_FAST_ARB_STRATEGY,
  });
  input.execute({
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    slug: input.opportunity.slug,
    question: input.opportunity.question,
    tokenId: input.opportunity.tokenIds.no,
    opportunityId: journaledOpportunity.id,
    side: "NO",
    entryPrice: validated.askNo,
    paperSizeUsd: roundUsd(validated.askNo * shares),
    paperSizeShares: shares,
    arbClass: WITHIN_MARKET_FAST_ARB_STRATEGY,
  });
  recordPaperFire({
    dedupeKey,
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    eventSlug: input.opportunity.slug,
    firedAt: input.nowMs,
  });
  updateOpportunityStatus(journaledOpportunity.id, {
    status: "paper_fired",
    ...telemetry,
    reason: "paper_trade_recorded",
  });
  await sendPaperFireAlert({
    executableEdge,
    logger: input.logger,
    paperTrades: 2,
    sendAlert: input.sendAlert,
    slug: input.opportunity.slug,
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
  });

  return {
    ...EMPTY_PROCESS_RESULT,
    paperTrades: 2,
    validatedOpportunities: 1,
    promotedNearMisses,
  };
}

/** A quote with a gross edge: the sum of both asks is below one dollar. */
function isRawAtQuote(opportunity: WithinMarketArbOpportunity): boolean {
  return roundPrice(opportunity.totalCost) < 1;
}

async function sendPaperFireAlert(input: {
  executableEdge: number;
  logger: ScanCycleLogger;
  paperTrades: number;
  sendAlert?: (message: string) => Promise<unknown>;
  slug: string;
  strategy: string;
}): Promise<void> {
  if (!input.sendAlert) {
    return;
  }

  try {
    await input.sendAlert(
      [
        "Paper opportunity fired",
        `strategy: ${input.strategy}`,
        `slug: ${input.slug}`,
        `paperTrades: ${input.paperTrades}`,
        `executableEdge: ${input.executableEdge.toFixed(4)}`,
      ].join("\n"),
    );
  } catch (error) {
    input.logger.warn(
      formatStructuredError("paper_fire_alert_failed", error, {
        component: "scanner",
        strategy: input.strategy,
      }),
    );
  }
}

type MeasuredScannerResult<T> = {
  opportunities: T[];
  durationMs: number;
  error?: string;
};

async function runMeasuredScanner<T>(
  scan: () => Promise<T[]>,
): Promise<MeasuredScannerResult<T>> {
  const startedAt = Date.now();

  try {
    return {
      opportunities: await scan(),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      opportunities: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function recordScannerErrors(input: {
  clearWinWatchScan: MeasuredScannerResult<ClearWinWatchOpportunity>;
  cycleStartedAt: number;
  negRiskScan: MeasuredScannerResult<NegRiskBracketOpportunity>;
  withinMarketScan: MeasuredScannerResult<WithinMarketArbOpportunity>;
}): void {
  if (input.negRiskScan.error) {
    recordScannerRun({
      strategy: NEG_RISK_BRACKET_STRATEGY,
      timestamp: input.cycleStartedAt,
      rawOpportunities: 0,
      durationMs: input.negRiskScan.durationMs,
      error: input.negRiskScan.error,
    });
  }

  if (input.withinMarketScan.error) {
    recordScannerRun({
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      timestamp: input.cycleStartedAt,
      rawOpportunities: 0,
      durationMs: input.withinMarketScan.durationMs,
      error: input.withinMarketScan.error,
    });
  }

  if (input.clearWinWatchScan.error) {
    recordScannerRun({
      strategy: CLEAR_WIN_WATCH_STRATEGY,
      timestamp: input.cycleStartedAt,
      rawOpportunities: 0,
      durationMs: input.clearWinWatchScan.durationMs,
      error: input.clearWinWatchScan.error,
    });
  }
}

function buildValidationTelemetry(
  validated: ValidatedNegRiskOpportunity | ValidatedWithinMarketOpportunity,
): OpportunityTelemetryInput {
  const basketSizing =
    "basketSizing" in validated ? validated.basketSizing : null;

  return {
    executableEdge: validated.expectedGrossEdge,
    fillableUsd: validated.fillableUsd,
    minLegDepthUsd: validated.minLegDepthUsd,
    legCount: validated.legCount,
    executableSum: validated.executableSum,
    feeAdjustedEdge: validated.feeAdjustedEdge,
    basketSizeShares: basketSizing?.basketSizeShares ?? null,
    basketCostUsd: basketSizing?.basketCostUsd ?? null,
    basketPayoutUsd: basketSizing?.basketPayoutUsd ?? null,
    basketProfitUsd: basketSizing?.basketProfitUsd ?? null,
    edgeBps: basketSizing?.edgeBps ?? null,
    roiBps: basketSizing?.roiBps ?? null,
    maxPositiveBasketShares: basketSizing?.maxPositiveBasketShares ?? null,
    maxPositiveBasketCostUsd: basketSizing?.maxPositiveBasketCostUsd ?? null,
  };
}

/**
 * Fee-aware economics of a validated NEG_RISK basket. Uses the basket sizing
 * (walked per leg at the executable size) when present, otherwise the
 * one-share average fills, so a rejected basket still gets honest numbers.
 */
export function buildNegRiskEconomics(
  validated: ValidatedNegRiskOpportunity,
  opportunity: NegRiskBracketOpportunity,
  options: { nowMs: number; roleMode: ExecutionRoleMode; category?: string | null },
): BasketEconomics | null {
  const sizing = validated.basketSizing ?? null;
  const legs = validated.legs.map((leg) => {
    const sized = sizing?.legs.find((candidate: NegRiskBasketSizingLeg) => candidate.tokenId === leg.tokenId);
    const price = sized?.averageFillPrice ?? leg.averageFillPrice;

    return price === null
      ? null
      : {
          venue: "polymarket" as const,
          side: "NO" as const,
          averageFillPrice: price,
          shares: sized?.shares ?? 1,
          category: options.category ?? null,
        };
  });

  if (legs.length === 0 || legs.some((leg) => leg === null)) {
    return null;
  }

  return computeBasketEconomics({
    legs: legs.filter((leg): leg is NonNullable<typeof leg> => leg !== null),
    payoutPerBasketShare: Math.max(1, validated.legs.length - 1),
    roleMode: options.roleMode,
    expectedResolutionAt: opportunity.expectedResolutionAt ?? null,
    nowMs: options.nowMs,
  });
}

export function buildWithinMarketEconomics(
  validated: ValidatedWithinMarketOpportunity,
  opportunity: WithinMarketArbOpportunity,
  options: { nowMs: number; roleMode: ExecutionRoleMode },
): BasketEconomics | null {
  if (validated.askYes === null || validated.askNo === null) {
    return null;
  }

  const shares =
    validated.executableShares && validated.executableShares > 0
      ? validated.executableShares
      : 1;
  const category = validated.category ?? opportunity.category ?? null;

  return computeBasketEconomics({
    legs: [
      {
        venue: "polymarket",
        side: "YES",
        averageFillPrice: validated.askYes,
        shares,
        category,
      },
      {
        venue: "polymarket",
        side: "NO",
        averageFillPrice: validated.askNo,
        shares,
        category,
      },
    ],
    payoutPerBasketShare: 1,
    roleMode: options.roleMode,
    expectedResolutionAt: opportunity.expectedResolutionAt ?? null,
    nowMs: options.nowMs,
  });
}

function buildEconomicsTelemetry(
  economics: BasketEconomics | null,
  depthUsd: number | null,
): OpportunityTelemetryInput {
  if (!economics) {
    return { depthUsd };
  }

  return {
    grossEdgeBps: economics.grossEdgeBps,
    netEdgeBps: economics.executableNetEdgeBps,
    feeUsd: economics.feeUsd,
    capitalUsd: economics.capitalUsd,
    depthUsd,
    daysToResolution: economics.daysToResolution,
    annualizedPct: economics.annualizedPct,
    feeAdjustedEdge:
      economics.basketShares > 0
        ? roundPrice(economics.netProfitUsd / economics.basketShares)
        : null,
  };
}

function buildTimingTelemetry(
  expectedResolutionAt: number | null | undefined,
  nowMs: number,
): Pick<
  OpportunityTelemetryInput,
  "expectedResolutionAt" | "durationHours" | "capitalLockClass"
> {
  const capitalLock = classifyCapitalLock(expectedResolutionAt, nowMs);

  return {
    expectedResolutionAt: capitalLock.expectedResolutionAt,
    durationHours: capitalLock.durationHours,
    capitalLockClass: capitalLock.capitalLockClass,
  };
}

/**
 * True when the expected resolution time is known and already behind the
 * clock. Such a market is settled or settling; nothing on its book is a fill.
 */
export function isPastExpectedResolution(
  expectedResolutionAt: number | null | undefined,
  nowMs: number,
): boolean {
  return (
    typeof expectedResolutionAt === "number" &&
    Number.isFinite(expectedResolutionAt) &&
    expectedResolutionAt > 0 &&
    expectedResolutionAt < nowMs
  );
}

type HorizonOutcome = {
  reject: RejectionReason | null;
  /** Short capital lock inside the configured window: paper-fires. */
  fireable: boolean;
  capitalLockClass: CapitalLockClass;
};

/**
 * Gate 4 of docs/ARB_TAXONOMY.md. Only two things reject here: an unknown
 * resolution time (an undated basket is never a chance) and an annualised
 * net return below the hurdle. Everything else is a class: `short` fires,
 * `medium` and `long` are carry candidates.
 */
export function classifyHorizon(input: {
  expectedResolutionAt: number | null | undefined;
  nowMs: number;
  annualizedPct: number | null;
  hurdlePct: number;
  maxShortDurationHours: number;
}): HorizonOutcome {
  const capitalLock = classifyCapitalLock(input.expectedResolutionAt, input.nowMs);

  if (capitalLock.capitalLockClass === "unknown") {
    return {
      reject: "unknown_duration_for_short_arb",
      fireable: false,
      capitalLockClass: "unknown",
    };
  }

  if (!meetsAnnualizedHurdle(input.annualizedPct, input.hurdlePct)) {
    return {
      reject: "below_annualized_hurdle",
      fireable: false,
      capitalLockClass: capitalLock.capitalLockClass,
    };
  }

  return {
    reject: null,
    fireable:
      capitalLock.capitalLockClass === "short" &&
      (capitalLock.durationHours ?? Number.POSITIVE_INFINITY) <=
        input.maxShortDurationHours,
    capitalLockClass: capitalLock.capitalLockClass,
  };
}

function withinMarketSpreadBps(
  validated: ValidatedWithinMarketOpportunity,
): number {
  const yesSpread = tokenSpreadBps(validated.yes);
  const noSpread = tokenSpreadBps(validated.no);

  return Math.max(yesSpread, noSpread);
}

function tokenSpreadBps(token: {
  bestAsk: number | null;
  bestBid: number | null;
}): number {
  if (token.bestAsk === null || token.bestBid === null) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.round(Math.abs(token.bestAsk - token.bestBid) * 10_000 * 100) / 100;
}

function getNegRiskPaperLegSizing(
  validated: ValidatedNegRiskOpportunity,
  tokenId: string,
  fallbackPaperSizeUsd: number,
): {
  entryPrice: number | null;
  paperSizeUsd: number;
  paperSizeShares?: number;
} {
  const basketLeg = validated.basketSizing?.legs.find(
    (leg: NegRiskBasketSizingLeg) => leg.tokenId === tokenId,
  );

  if (basketLeg) {
    return {
      entryPrice: basketLeg.averageFillPrice,
      paperSizeUsd: basketLeg.costUsd,
      paperSizeShares: basketLeg.shares,
    };
  }

  const validatedLeg = validated.legs.find((leg) => leg.tokenId === tokenId);

  return {
    entryPrice: validatedLeg?.averageFillPrice ?? null,
    paperSizeUsd: fallbackPaperSizeUsd,
  };
}

function economicsLegFor(
  economics: BasketEconomics | null,
  index: number,
): { role: string; shares: number; sizeUsd: number; feeUsd: number } | null {
  const leg = economics?.legs[index];

  return leg
    ? { role: leg.role, shares: leg.shares, sizeUsd: leg.sizeUsd, feeUsd: leg.feeUsd }
    : null;
}

function recordNegRiskLegTelemetry(input: {
  economics: BasketEconomics | null;
  nowMs: number;
  opportunity: NegRiskBracketOpportunity;
  opportunityId: string;
  validated: ValidatedNegRiskOpportunity;
}): void {
  for (const leg of input.validated.legs) {
    if (leg.orderbook) {
      recordOrderBookSnapshot({
        tokenId: leg.tokenId,
        marketSlug: leg.slug,
        eventSlug: input.opportunity.eventSlug,
        marketId: leg.marketId,
        side: leg.sideToPaperTrade,
        strategySource: NEG_RISK_BRACKET_STRATEGY,
        expectedResolutionAt: input.opportunity.expectedResolutionAt,
        opportunityId: input.opportunityId,
        orderbook: leg.orderbook,
        capturedAt: input.nowMs,
      });
    }
  }

  recordOpportunityLegs(
    input.validated.legs.map((leg, index) => {
      const rawLeg = input.opportunity.legs.find(
        (candidate) => candidate.noTokenId === leg.tokenId,
      );
      const economicsLeg = economicsLegFor(input.economics, index);

      return {
        opportunityId: input.opportunityId,
        strategy: NEG_RISK_BRACKET_STRATEGY,
        slug: leg.slug,
        marketId: leg.marketId,
        question: leg.question,
        tokenId: leg.tokenId,
        side: leg.sideToPaperTrade,
        rawYesPrice: rawLeg?.yesPrice ?? null,
        averageFillPrice: leg.averageFillPrice,
        maxFillableUsd: leg.maxFillableUsd,
        bestBid: leg.bestBid,
        bestAsk: leg.bestAsk,
        fillable: leg.fillable,
        reason: leg.reason,
        venue: "polymarket",
        role: economicsLeg?.role ?? null,
        shares: economicsLeg?.shares ?? null,
        sizeUsd: economicsLeg?.sizeUsd ?? null,
        feeUsd: economicsLeg?.feeUsd ?? null,
        legIndex: index,
        timestamp: input.nowMs,
      };
    }),
  );
}

function recordWithinMarketLegTelemetry(input: {
  economics: BasketEconomics | null;
  nowMs: number;
  opportunity: WithinMarketArbOpportunity;
  opportunityId: string;
  validated: ValidatedWithinMarketOpportunity;
}): void {
  if (input.validated.yes.orderbook) {
    recordOrderBookSnapshot({
      tokenId: input.opportunity.tokenIds.yes,
      marketSlug: input.opportunity.slug,
      side: "YES",
      strategySource: WITHIN_MARKET_FAST_ARB_STRATEGY,
      expectedResolutionAt: input.opportunity.expectedResolutionAt,
      opportunityId: input.opportunityId,
      orderbook: input.validated.yes.orderbook,
      capturedAt: input.nowMs,
    });
  }

  if (input.validated.no.orderbook) {
    recordOrderBookSnapshot({
      tokenId: input.opportunity.tokenIds.no,
      marketSlug: input.opportunity.slug,
      side: "NO",
      strategySource: WITHIN_MARKET_FAST_ARB_STRATEGY,
      expectedResolutionAt: input.opportunity.expectedResolutionAt,
      opportunityId: input.opportunityId,
      orderbook: input.validated.no.orderbook,
      capturedAt: input.nowMs,
    });
  }

  const yesEconomics = economicsLegFor(input.economics, 0);
  const noEconomics = economicsLegFor(input.economics, 1);

  recordOpportunityLegs([
    {
      opportunityId: input.opportunityId,
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      slug: input.opportunity.slug,
      question: input.opportunity.question,
      tokenId: input.opportunity.tokenIds.yes,
      side: "YES",
      rawYesPrice: input.opportunity.askYes,
      averageFillPrice: input.validated.yes.averageFillPrice,
      maxFillableUsd: input.validated.yes.maxFillableUsd,
      bestBid: input.validated.yes.bestBid,
      bestAsk: input.validated.yes.bestAsk,
      fillable: input.validated.yes.fillable,
      reason: input.validated.yes.reason,
      venue: "polymarket",
      role: yesEconomics?.role ?? null,
      shares: yesEconomics?.shares ?? null,
      sizeUsd: yesEconomics?.sizeUsd ?? null,
      feeUsd: yesEconomics?.feeUsd ?? null,
      legIndex: 0,
      timestamp: input.nowMs,
    },
    {
      opportunityId: input.opportunityId,
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      slug: input.opportunity.slug,
      question: input.opportunity.question,
      tokenId: input.opportunity.tokenIds.no,
      side: "NO",
      rawYesPrice: null,
      averageFillPrice: input.validated.no.averageFillPrice,
      maxFillableUsd: input.validated.no.maxFillableUsd,
      bestBid: input.validated.no.bestBid,
      bestAsk: input.validated.no.bestAsk,
      fillable: input.validated.no.fillable,
      reason: input.validated.no.reason,
      venue: "polymarket",
      role: noEconomics?.role ?? null,
      shares: noEconomics?.shares ?? null,
      sizeUsd: noEconomics?.sizeUsd ?? null,
      feeUsd: noEconomics?.feeUsd ?? null,
      legIndex: 1,
      timestamp: input.nowMs,
    },
  ]);
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
