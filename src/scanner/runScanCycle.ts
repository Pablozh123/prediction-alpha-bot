import { executeOrPaper } from "../execution/executeOrPaper.js";
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

const NEG_RISK_BRACKET_STRATEGY = "neg_risk_bracket_arb";
const DEFAULT_PAPER_SIZE_USD = 1;
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
  error?: string;
};

export type RunScanCycleOptions = {
  scanner?: () => Promise<NegRiskBracketOpportunity[]>;
  execute?: typeof executeOrPaper;
  logger?: ScanCycleLogger;
  paperSizeUsd?: number;
  paperFireCooldownMs?: number;
  now?: () => number;
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

  const scanner = options.scanner ?? scanNegRiskBracketArbs;
  const execute = options.execute ?? executeOrPaper;
  const logger = options.logger ?? defaultLogger;
  const paperSizeUsd = options.paperSizeUsd ?? DEFAULT_PAPER_SIZE_USD;
  const paperFireCooldownMs =
    options.paperFireCooldownMs ?? DEFAULT_PAPER_FIRE_COOLDOWN_MS;
  const now = options.now ?? Date.now;

  try {
    const opportunities = await scanner();
    addOpportunitiesFound(opportunities.length);
    logger.info(`NEG_RISK bracket opportunities: ${opportunities.length}`);

    let paperTrades = 0;
    let skippedDuplicates = 0;

    for (const opportunity of opportunities) {
      const dedupeKey = buildOpportunityDedupeKey(opportunity);
      const nowMs = now();

      if (hasRecentPaperFire(dedupeKey, nowMs, paperFireCooldownMs)) {
        logger.info("skipped duplicate paper opportunity.");
        skippedDuplicates += 1;
        continue;
      }

      for (const leg of opportunity.legs) {
        execute({
          strategy: NEG_RISK_BRACKET_STRATEGY,
          slug: leg.slug,
          question: leg.question,
          tokenId:
            leg.sideToPaperTrade === "NO" ? leg.noTokenId : leg.yesTokenId,
          side: leg.sideToPaperTrade,
          entryPrice: leg.yesPrice,
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
    }

    addPaperTrades(paperTrades);

    return {
      success: true,
      opportunities: opportunities.length,
      paperTrades,
      skippedDuplicates
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
