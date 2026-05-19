import {
  executeOrPaper,
  type ExecuteOrPaperResult
} from "../execution/executeOrPaper.js";

export const DEFAULT_WITHIN_MARKET_ARB_THRESHOLD = 0.98;
export const WITHIN_MARKET_ARB_STRATEGY = "within_market_yes_no_arb";

export type WithinMarketArbMarket = {
  slug: string;
  question: string;
  askYes: number;
  askNo: number;
  tokenIds: {
    yes: string;
    no: string;
  };
};

export type WithinMarketArbOpportunity = {
  slug: string;
  question: string;
  askYes: number;
  askNo: number;
  totalCost: number;
  expectedEdge: number;
  tokenIds: {
    yes: string;
    no: string;
  };
  reason: "yes_no_ask_sum_below_threshold";
};

export type ScanWithinMarketArbOptions = {
  threshold?: number;
  warn?: (message: string) => void;
};

export type PaperWithinMarketArbOptions = {
  execute?: typeof executeOrPaper;
  paperSizeUsd?: number;
};

const DEFAULT_PAPER_SIZE_USD = 1;

export function scanWithinMarketArbs(
  markets: WithinMarketArbMarket[],
  options: ScanWithinMarketArbOptions = {}
): WithinMarketArbOpportunity[] {
  const threshold = options.threshold ?? DEFAULT_WITHIN_MARKET_ARB_THRESHOLD;
  const warn = options.warn ?? console.warn;
  const opportunities: WithinMarketArbOpportunity[] = [];

  for (const market of markets) {
    if (!isValidMarket(market)) {
      warn(`Skipping within-market arb candidate "${market.slug}": invalid market fields.`);
      continue;
    }

    const totalCost = roundPrice(market.askYes + market.askNo);

    if (totalCost < threshold) {
      opportunities.push({
        slug: market.slug,
        question: market.question,
        askYes: market.askYes,
        askNo: market.askNo,
        totalCost,
        expectedEdge: roundPrice(1 - totalCost),
        tokenIds: market.tokenIds,
        reason: "yes_no_ask_sum_below_threshold"
      });
    }
  }

  return opportunities;
}

export function paperWithinMarketArbOpportunity(
  opportunity: WithinMarketArbOpportunity,
  options: PaperWithinMarketArbOptions = {}
): ExecuteOrPaperResult[] {
  const execute = options.execute ?? executeOrPaper;
  const paperSizeUsd = options.paperSizeUsd ?? DEFAULT_PAPER_SIZE_USD;

  return [
    execute({
      strategy: WITHIN_MARKET_ARB_STRATEGY,
      slug: opportunity.slug,
      question: opportunity.question,
      tokenId: opportunity.tokenIds.yes,
      side: "YES",
      entryPrice: opportunity.askYes,
      paperSizeUsd,
      arbClass: WITHIN_MARKET_ARB_STRATEGY
    }),
    execute({
      strategy: WITHIN_MARKET_ARB_STRATEGY,
      slug: opportunity.slug,
      question: opportunity.question,
      tokenId: opportunity.tokenIds.no,
      side: "NO",
      entryPrice: opportunity.askNo,
      paperSizeUsd,
      arbClass: WITHIN_MARKET_ARB_STRATEGY
    })
  ];
}

function isValidMarket(market: WithinMarketArbMarket): boolean {
  return (
    market.slug.trim().length > 0 &&
    market.question.trim().length > 0 &&
    market.tokenIds.yes.trim().length > 0 &&
    market.tokenIds.no.trim().length > 0 &&
    isPlausibleAsk(market.askYes) &&
    isPlausibleAsk(market.askNo)
  );
}

function isPlausibleAsk(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
