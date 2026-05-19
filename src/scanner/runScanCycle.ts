import { executeOrPaper } from "../execution/executeOrPaper.js";
import {
  recordOpportunity,
  updateOpportunityStatus
} from "../execution/opportunityJournal.js";
import {
  buildPaperFireDedupeKey,
  hasRecentPaperFire,
  recordPaperFire
} from "../execution/paperDedupe.js";
import {
  addOpportunitiesFound,
  addPaperTrades,
  incrementErrors,
  incrementScanCycles
} from "../utils/metrics.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";
import {
  scanNegRiskBracketArbs,
  type NegRiskBracketOpportunity
} from "./negRiskBracketScanner.js";
import {
  validateNegRiskOpportunity,
  validateWithinMarketOpportunity,
  type ValidatedNegRiskOpportunity,
  type ValidatedWithinMarketOpportunity
} from "./opportunityValidator.js";
import {
  DEFAULT_WITHIN_MARKET_ARB_THRESHOLD,
  scanWithinMarketArbOpportunities,
  WITHIN_MARKET_ARB_STRATEGY,
  type WithinMarketArbOpportunity
} from "./withinMarketArbScanner.js";

const NEG_RISK_BRACKET_STRATEGY = "neg_risk_bracket_arb";
const DEFAULT_PAPER_SIZE_USD = 1;
const SCANNER_WARNING_LIMIT_PER_CYCLE = 8;
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
  withinMarketScanner?: () => Promise<WithinMarketArbOpportunity[]>;
  execute?: typeof executeOrPaper;
  logger?: ScanCycleLogger;
  paperSizeUsd?: number;
  paperFireCooldownMs?: number;
  now?: () => number;
  validateOpportunity?: (
    opportunity: NegRiskBracketOpportunity,
    targetSizeUsd: number
  ) => Promise<ValidatedNegRiskOpportunity>;
  validateWithinMarket?: (
    opportunity: WithinMarketArbOpportunity,
    targetSizeUsd: number
  ) => Promise<ValidatedWithinMarketOpportunity>;
};

const defaultLogger: ScanCycleLogger = {
  info: logInfo,
  warn: logWarn,
  error: logError
};

export async function runScanCycle(
  options: RunScanCycleOptions = {}
): Promise<ScanCycleResult> {
  incrementScanCycles();

  const scanner = options.scanner;
  const withinMarketScanner =
    options.withinMarketScanner ?? scanWithinMarketArbOpportunities;
  const execute = options.execute ?? executeOrPaper;
  const logger = options.logger ?? defaultLogger;
  const paperSizeUsd = options.paperSizeUsd ?? DEFAULT_PAPER_SIZE_USD;
  const paperFireCooldownMs =
    options.paperFireCooldownMs ?? DEFAULT_PAPER_FIRE_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  const validateOpportunity =
    options.validateOpportunity ?? validateNegRiskOpportunity;
  const validateWithinMarket =
    options.validateWithinMarket ?? validateWithinMarketOpportunity;

  try {
    const negRiskWarningLimiter = createCycleWarningLimiter(
      logger,
      "NEG_RISK scanner",
      SCANNER_WARNING_LIMIT_PER_CYCLE
    );
    const [opportunities, withinMarketOpportunities] = await Promise.all([
      scanner
        ? scanner()
        : scanNegRiskBracketArbs({ warn: negRiskWarningLimiter.warn }),
      withinMarketScanner()
    ]);
    negRiskWarningLimiter.flush();
    addOpportunitiesFound(
      opportunities.length + withinMarketOpportunities.length
    );
    logger.info(`NEG_RISK bracket opportunities: ${opportunities.length}`);
    logger.info(`Within-market opportunities: ${withinMarketOpportunities.length}`);

    let paperTrades = 0;
    let skippedDuplicates = 0;
    let rejectedOpportunities = 0;

    for (const opportunity of opportunities) {
      const dedupeKey = buildOpportunityDedupeKey(opportunity);
      const nowMs = now();
      const tokenIds = getPaperTokenIds(opportunity);
      const journaledOpportunity = recordOpportunity({
        strategy: NEG_RISK_BRACKET_STRATEGY,
        slug: opportunity.eventSlug,
        rawEdge: opportunity.expectedEdge,
        status: "raw_found",
        reason: opportunity.reason,
        tokenIds,
        timestamp: nowMs
      });

      if (hasRecentPaperFire(dedupeKey, nowMs, paperFireCooldownMs)) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          reason: "duplicate_within_cooldown"
        });
        logger.info("skipped duplicate paper opportunity.");
        skippedDuplicates += 1;
        rejectedOpportunities += 1;
        continue;
      }

      const validated = await validateOpportunity(opportunity, paperSizeUsd);
      const executableEdge = validated.expectedGrossEdge;

      if (!validated.valid) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          executableEdge,
          reason: validated.reason
        });
        logger.warn(`skipped invalid paper opportunity: ${validated.reason}.`);
        rejectedOpportunities += 1;
        continue;
      }

      if (executableEdge === null || executableEdge <= 0) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          executableEdge,
          reason: "non_positive_executable_edge"
        });
        logger.warn(
          "skipped invalid paper opportunity: non_positive_executable_edge."
        );
        rejectedOpportunities += 1;
        continue;
      }

      if (validated.legs.some((leg) => leg.averageFillPrice === null)) {
        updateOpportunityStatus(journaledOpportunity.id, {
          status: "rejected",
          executableEdge,
          reason: "missing_fill_price"
        });
        logger.warn("skipped invalid paper opportunity: missing fill price.");
        rejectedOpportunities += 1;
        continue;
      }

      updateOpportunityStatus(journaledOpportunity.id, {
        status: "validated",
        executableEdge,
        reason: validated.reason
      });

      for (const leg of validated.legs) {
        const entryPrice = leg.averageFillPrice;

        if (entryPrice === null) {
          throw new Error("Validated opportunity is missing a fill price.");
        }

        execute({
          strategy: NEG_RISK_BRACKET_STRATEGY,
          slug: leg.slug,
          question: leg.question,
          tokenId: leg.tokenId,
          side: leg.sideToPaperTrade,
          entryPrice,
          paperSizeUsd,
          arbClass: NEG_RISK_BRACKET_STRATEGY
        });
        paperTrades += 1;
      }

      recordPaperFire({
        dedupeKey,
        strategy: NEG_RISK_BRACKET_STRATEGY,
        eventSlug: opportunity.eventSlug,
        firedAt: nowMs
      });
      updateOpportunityStatus(journaledOpportunity.id, {
        status: "paper_fired",
        executableEdge,
        reason: "paper_trade_recorded"
      });
    }

    for (const opportunity of withinMarketOpportunities) {
      const result = await processWithinMarketOpportunity({
        execute,
        logger,
        nowMs: now(),
        opportunity,
        paperFireCooldownMs,
        paperSizeUsd,
        validateWithinMarket
      });

      paperTrades += result.paperTrades;
      skippedDuplicates += result.skippedDuplicates;
      rejectedOpportunities += result.rejectedOpportunities;
    }

    addPaperTrades(paperTrades);

    return {
      success: true,
      opportunities: opportunities.length + withinMarketOpportunities.length,
      paperTrades,
      skippedDuplicates,
      rejectedOpportunities
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    incrementErrors();
    logger.error(`scan cycle failed: ${message}`);

    return {
      success: false,
      opportunities: 0,
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 0,
      error: message
    };
  }
}

function buildOpportunityDedupeKey(
  opportunity: NegRiskBracketOpportunity
): string {
  return buildPaperFireDedupeKey({
    strategy: NEG_RISK_BRACKET_STRATEGY,
    eventSlug: opportunity.eventSlug,
    threshold: opportunity.threshold,
    tokenIds: opportunity.legs.map((leg) =>
      leg.sideToPaperTrade === "NO" ? leg.noTokenId : leg.yesTokenId
    )
  });
}

function getPaperTokenIds(opportunity: NegRiskBracketOpportunity): string[] {
  return opportunity.legs.map((leg) =>
    leg.sideToPaperTrade === "NO" ? leg.noTokenId : leg.yesTokenId
  );
}

function createCycleWarningLimiter(
  logger: ScanCycleLogger,
  label: string,
  limit: number
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
          `${label}: suppressed ${suppressed} additional warning(s) this cycle.`
        );
      }
    }
  };
}

type ProcessWithinMarketOpportunityInput = {
  execute: typeof executeOrPaper;
  logger: ScanCycleLogger;
  nowMs: number;
  opportunity: WithinMarketArbOpportunity;
  paperFireCooldownMs: number;
  paperSizeUsd: number;
  validateWithinMarket: (
    opportunity: WithinMarketArbOpportunity,
    targetSizeUsd: number
  ) => Promise<ValidatedWithinMarketOpportunity>;
};

type ProcessOpportunityResult = {
  paperTrades: number;
  skippedDuplicates: number;
  rejectedOpportunities: number;
};

async function processWithinMarketOpportunity(
  input: ProcessWithinMarketOpportunityInput
): Promise<ProcessOpportunityResult> {
  const tokenIds = [input.opportunity.tokenIds.yes, input.opportunity.tokenIds.no];
  const dedupeKey = buildPaperFireDedupeKey({
    strategy: WITHIN_MARKET_ARB_STRATEGY,
    eventSlug: input.opportunity.slug,
    threshold: DEFAULT_WITHIN_MARKET_ARB_THRESHOLD,
    tokenIds
  });
  const journaledOpportunity = recordOpportunity({
    strategy: WITHIN_MARKET_ARB_STRATEGY,
    slug: input.opportunity.slug,
    rawEdge: input.opportunity.expectedEdge,
    status: "raw_found",
    reason: input.opportunity.reason,
    tokenIds,
    timestamp: input.nowMs
  });

  if (hasRecentPaperFire(dedupeKey, input.nowMs, input.paperFireCooldownMs)) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      reason: "duplicate_within_cooldown"
    });
    input.logger.info("skipped duplicate paper opportunity.");

    return {
      paperTrades: 0,
      skippedDuplicates: 1,
      rejectedOpportunities: 1
    };
  }

  const validated = await input.validateWithinMarket(
    input.opportunity,
    input.paperSizeUsd
  );
  const executableEdge = validated.expectedGrossEdge;

  if (!validated.valid) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      executableEdge,
      reason: validated.reason
    });
    input.logger.warn(`skipped invalid paper opportunity: ${validated.reason}.`);

    return {
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1
    };
  }

  if (
    executableEdge === null ||
    executableEdge <= 0 ||
    validated.askYes === null ||
    validated.askNo === null
  ) {
    updateOpportunityStatus(journaledOpportunity.id, {
      status: "rejected",
      executableEdge,
      reason: "non_positive_executable_edge"
    });
    input.logger.warn(
      "skipped invalid paper opportunity: non_positive_executable_edge."
    );

    return {
      paperTrades: 0,
      skippedDuplicates: 0,
      rejectedOpportunities: 1
    };
  }

  updateOpportunityStatus(journaledOpportunity.id, {
    status: "validated",
    executableEdge,
    reason: validated.reason
  });

  input.execute({
    strategy: WITHIN_MARKET_ARB_STRATEGY,
    slug: input.opportunity.slug,
    question: input.opportunity.question,
    tokenId: input.opportunity.tokenIds.yes,
    side: "YES",
    entryPrice: validated.askYes,
    paperSizeUsd: input.paperSizeUsd,
    arbClass: WITHIN_MARKET_ARB_STRATEGY
  });
  input.execute({
    strategy: WITHIN_MARKET_ARB_STRATEGY,
    slug: input.opportunity.slug,
    question: input.opportunity.question,
    tokenId: input.opportunity.tokenIds.no,
    side: "NO",
    entryPrice: validated.askNo,
    paperSizeUsd: input.paperSizeUsd,
    arbClass: WITHIN_MARKET_ARB_STRATEGY
  });
  recordPaperFire({
    dedupeKey,
    strategy: WITHIN_MARKET_ARB_STRATEGY,
    eventSlug: input.opportunity.slug,
    firedAt: input.nowMs
  });
  updateOpportunityStatus(journaledOpportunity.id, {
    status: "paper_fired",
    executableEdge,
    reason: "paper_trade_recorded"
  });

  return {
    paperTrades: 2,
    skippedDuplicates: 0,
    rejectedOpportunities: 0
  };
}
