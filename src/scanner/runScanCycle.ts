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
import {
  classifyNegRiskOpportunityForPaperFire,
} from "./negRiskBasketClassifier.js";
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
} from "../utils/marketTime.js";

const NEG_RISK_BRACKET_STRATEGY = "neg_risk_bracket_arb";
const DEFAULT_PAPER_SIZE_USD = 1;
const DEFAULT_MIN_PAPER_FIRE_EDGE = 0;
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
  paperSizeUsd?: number;
  paperFireCooldownMs?: number;
  minPaperFireEdge?: number;
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
      formatOpportunityCount(
        "Within-market opportunities",
        rawWithinMarketOpportunities.length,
        withinMarketOpportunities.length,
      ),
    );
    logger.info(`Clear-win-watch diagnostics: ${rawClearWinWatchOpportunities.length}`);

    let paperTrades = 0;
    let skippedDuplicates = 0;
    let rejectedOpportunities = 0;
    let negRiskPaperTrades = 0;
    let negRiskValidatedOpportunities = 0;
    let negRiskRejectedOpportunities = 0;
    let negRiskDedupeSkips = 0;
    let withinMarketPaperTrades = 0;
    let withinMarketValidatedOpportunities = 0;
    let withinMarketRejectedOpportunities = 0;
    let withinMarketDedupeSkips = 0;
    let clearWinWatchRejectedOpportunities = 0;

    for (const opportunity of rawClearWinWatchOpportunities.slice(
      0,
      maxOpportunitiesPerStrategy,
    )) {
      recordOpportunity({
        strategy: CLEAR_WIN_WATCH_STRATEGY,
        slug: opportunity.slug,
        rawEdge: null,
        status: "rejected",
        reason: CLEAR_WIN_WATCH_REASON,
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
        rawEdge: opportunity.expectedEdge,
        status: "raw_found",
        reason: opportunity.reason,
        tokenIds,
        timestamp: nowMs,
        ...buildTimingTelemetry(opportunity.expectedResolutionAt, nowMs),
      });

      const validated = await validateOpportunity(opportunity, paperSizeUsd);
      const executableEdge = validated.expectedGrossEdge;
      const telemetry = {
        ...buildValidationTelemetry(validated),
        ...buildTimingTelemetry(opportunity.expectedResolutionAt, nowMs),
      };
      recordNegRiskLegTelemetry({
        nowMs,
        opportunity,
        opportunityId: journaledOpportunity.id,
        validated,
      });

      if (!validated.valid) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...telemetry,
          reason: validated.reason,
        });
        validationWarningLimiter.warn(
          `skipped invalid paper opportunity: ${validated.reason}.`,
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
        continue;
      }

      if (executableEdge === null || executableEdge <= minPaperFireEdge) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...telemetry,
          reason: "non_positive_executable_edge",
        });
        validationWarningLimiter.warn(
          "skipped invalid paper opportunity: non_positive_executable_edge.",
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
        continue;
      }

      if (validated.legs.some((leg) => leg.averageFillPrice === null)) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...telemetry,
          reason: "missing_fill_price",
        });
        validationWarningLimiter.warn(
          "skipped invalid paper opportunity: missing fill price.",
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
        continue;
      }

      const durationRejectReason = getShortDurationRejectReason(
        opportunity.expectedResolutionAt,
        nowMs,
      );

      if (durationRejectReason) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...telemetry,
          reason: durationRejectReason,
        });
        validationWarningLimiter.warn(
          `skipped invalid paper opportunity: ${durationRejectReason}.`,
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
        continue;
      }

      const cleanBasket = evaluateCleanNegRiskBasket(
        opportunity,
        validated,
        {
          ...cleanBasketFilterOptions,
          enabled: true,
          nowMs,
        },
      );
      const basketClassification = classifyNegRiskOpportunityForPaperFire(
        opportunity,
        cleanBasket.reason,
      );

      if (!cleanBasket.valid || basketClassification.basketClass !== "clean_arb") {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          ...telemetry,
          reason: cleanBasket.reason,
        });
        validationWarningLimiter.warn(
          `skipped invalid paper opportunity: ${cleanBasket.reason}.`,
        );
        rejectedOpportunities += 1;
        negRiskRejectedOpportunities += 1;
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
        nowMs: now(),
        opportunity,
        paperFireCooldownMs,
        paperSizeUsd,
        sendAlert,
        validateWithinMarket,
        minPaperFireEdge,
      });

      paperTrades += result.paperTrades;
      skippedDuplicates += result.skippedDuplicates;
      rejectedOpportunities += result.rejectedOpportunities;
      withinMarketPaperTrades += result.paperTrades;
      withinMarketValidatedOpportunities += result.validatedOpportunities;
      withinMarketRejectedOpportunities += result.rejectedOpportunities;
      withinMarketDedupeSkips += result.skippedDuplicates;
    }

      recordScannerRun({
      strategy: NEG_RISK_BRACKET_STRATEGY,
      timestamp: cycleStartedAt,
      rawOpportunities: rawNegRiskOpportunities.length,
      validatedOpportunities: negRiskValidatedOpportunities,
      rejectedOpportunities: negRiskRejectedOpportunities,
      dedupeSkips: negRiskDedupeSkips,
      paperTrades: negRiskPaperTrades,
      durationMs: negRiskScan.durationMs,
    });
    recordScannerRun({
      strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
      timestamp: cycleStartedAt,
      rawOpportunities: rawWithinMarketOpportunities.length,
      validatedOpportunities: withinMarketValidatedOpportunities,
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

    const result = {
      success: true,
      opportunities:
        rawNegRiskOpportunities.length +
        rawWithinMarketOpportunities.length +
        rawClearWinWatchOpportunities.length,
      paperTrades,
      skippedDuplicates,
      rejectedOpportunities,
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

    const result = {
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
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
  nowMs: number;
  opportunity: WithinMarketArbOpportunity;
  paperFireCooldownMs: number;
  paperSizeUsd: number;
  minPaperFireEdge: number;
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

    return {
      paperTrades: 0,
      skippedDuplicates: 1,
      rejectedOpportunities: 0,
      validatedOpportunities: 0,
    };
  }

  const journaledOpportunity = recordOpportunity({
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    slug: input.opportunity.slug,
    rawEdge: input.opportunity.expectedEdge,
    status: "raw_found",
    reason: input.opportunity.reason,
    tokenIds,
    timestamp: input.nowMs,
    ...buildTimingTelemetry(input.opportunity.expectedResolutionAt ?? null, input.nowMs),
  });

  const validated = await input.validateWithinMarket(
    input.opportunity,
    input.paperSizeUsd,
  );
  const executableEdge = validated.expectedGrossEdge;
  const telemetry = {
    ...buildValidationTelemetry(validated),
    ...buildTimingTelemetry(input.opportunity.expectedResolutionAt ?? null, input.nowMs),
  };
  recordWithinMarketLegTelemetry({
    nowMs: input.nowMs,
    opportunity: input.opportunity,
    opportunityId: journaledOpportunity.id,
    validated,
  });

  if (!validated.valid) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      ...telemetry,
      reason: validated.reason,
    });
    input.logger.warn(
      `skipped invalid paper opportunity: ${validated.reason}.`,
    );

    return {
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1,
      validatedOpportunities: 0,
    };
  }

  if (
    executableEdge === null ||
    executableEdge <= input.minPaperFireEdge ||
    validated.askYes === null ||
    validated.askNo === null
  ) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      ...telemetry,
      reason: "non_positive_executable_edge",
    });
    input.logger.warn(
      "skipped invalid paper opportunity: non_positive_executable_edge.",
    );

    return {
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1,
      validatedOpportunities: 0,
    };
  }

  const durationRejectReason = getShortDurationRejectReason(
    input.opportunity.expectedResolutionAt ?? null,
    input.nowMs,
  );

  if (durationRejectReason) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      ...telemetry,
      reason: durationRejectReason,
    });
    input.logger.warn(`skipped invalid paper opportunity: ${durationRejectReason}.`);

    return {
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1,
      validatedOpportunities: 0,
    };
  }

  if (withinMarketSpreadBps(validated) > DEFAULT_CLEAN_BASKET_FILTER_OPTIONS.maxLegSpreadBps) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      ...telemetry,
      reason: "wide_leg_spread",
    });
    input.logger.warn("skipped invalid paper opportunity: wide_leg_spread.");

    return {
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1,
      validatedOpportunities: 0,
    };
  }

  updateOpportunityStatus(journaledOpportunity.id, {
    status: "validated",
    ...telemetry,
    reason: validated.reason,
  });

  input.execute({
    strategy: WITHIN_MARKET_FAST_ARB_STRATEGY,
    slug: input.opportunity.slug,
    question: input.opportunity.question,
    tokenId: input.opportunity.tokenIds.yes,
    opportunityId: journaledOpportunity.id,
    side: "YES",
    entryPrice: validated.askYes,
    paperSizeUsd: validated.askYes,
    paperSizeShares: 1,
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
    paperSizeUsd: validated.askNo,
    paperSizeShares: 1,
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
    paperTrades: 2,
    skippedDuplicates: 0,
    rejectedOpportunities: 0,
    validatedOpportunities: 1,
  };
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

function getShortDurationRejectReason(
  expectedResolutionAt: number | null | undefined,
  nowMs: number,
): "unknown_duration_for_short_arb" | "duration_too_long_for_short_arb" | null {
  const capitalLock = classifyCapitalLock(expectedResolutionAt, nowMs);

  if (capitalLock.capitalLockClass === "unknown") {
    return "unknown_duration_for_short_arb";
  }

  if (capitalLock.capitalLockClass !== "short") {
    return "duration_too_long_for_short_arb";
  }

  return null;
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

function recordNegRiskLegTelemetry(input: {
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
        legIndex: index,
        timestamp: input.nowMs,
      };
    }),
  );
}

function recordWithinMarketLegTelemetry(input: {
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
      legIndex: 1,
      timestamp: input.nowMs,
    },
  ]);
}
