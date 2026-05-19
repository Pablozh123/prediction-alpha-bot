import type { NegRiskBracketOpportunity } from "./negRiskBracketScanner.js";
import type { WithinMarketArbOpportunity } from "./withinMarketArbScanner.js";
import {
  fetchOrderBook,
  getBestBidAsk,
  walkAsksForSize,
  type OrderBook
} from "../utils/orderbook.js";

export type OpportunityValidationReason =
  | "orderbook_validated"
  | "partial_basket_invalid"
  | "invalid_token_ids";

export type ValidatedTokenAsk = {
  tokenId: string;
  fillable: boolean;
  averageFillPrice: number | null;
  maxFillableUsd: number;
  bestBid: number | null;
  bestAsk: number | null;
  reason: "fillable" | "not_fillable" | "orderbook_error";
};

export type ValidatedWithinMarketOpportunity = {
  slug: string;
  question: string;
  tokenIds: {
    yes: string;
    no: string;
  };
  askYes: number | null;
  askNo: number | null;
  totalCost: number | null;
  expectedGrossEdge: number | null;
  fillable: boolean;
  valid: boolean;
  reason: OpportunityValidationReason;
  yes: ValidatedTokenAsk;
  no: ValidatedTokenAsk;
};

export type ValidatedNegRiskLeg = {
  marketId: string;
  slug: string;
  question: string;
  tokenId: string;
  sideToPaperTrade: "NO";
  averageFillPrice: number | null;
  maxFillableUsd: number;
  bestBid: number | null;
  bestAsk: number | null;
  fillable: boolean;
  reason: ValidatedTokenAsk["reason"];
};

export type ValidatedNegRiskOpportunity = {
  eventSlug: string;
  threshold: number;
  executableSum: number | null;
  expectedGrossEdge: number | null;
  fillable: boolean;
  valid: boolean;
  reason: OpportunityValidationReason;
  legs: ValidatedNegRiskLeg[];
};

export type OpportunityValidatorOptions = {
  fetchOrderBook?: (tokenId: string) => Promise<OrderBook>;
};

export async function validateWithinMarketOpportunity(
  opportunity: WithinMarketArbOpportunity,
  targetSizeUsd: number,
  options: OpportunityValidatorOptions = {}
): Promise<ValidatedWithinMarketOpportunity> {
  const fetchBook = options.fetchOrderBook ?? fetchOrderBook;
  const yesTokenId = opportunity.tokenIds.yes;
  const noTokenId = opportunity.tokenIds.no;

  if (!yesTokenId.trim() || !noTokenId.trim()) {
    const emptyYes = emptyTokenValidation(yesTokenId);
    const emptyNo = emptyTokenValidation(noTokenId);

    return {
      slug: opportunity.slug,
      question: opportunity.question,
      tokenIds: opportunity.tokenIds,
      askYes: null,
      askNo: null,
      totalCost: null,
      expectedGrossEdge: null,
      fillable: false,
      valid: false,
      reason: "invalid_token_ids",
      yes: emptyYes,
      no: emptyNo
    };
  }

  const [yes, no] = await Promise.all([
    validateTokenAsk(yesTokenId, targetSizeUsd, fetchBook),
    validateTokenAsk(noTokenId, targetSizeUsd, fetchBook)
  ]);
  const fillable = yes.fillable && no.fillable;
  const totalCost =
    yes.averageFillPrice === null || no.averageFillPrice === null
      ? null
      : roundPrice(yes.averageFillPrice + no.averageFillPrice);

  return {
    slug: opportunity.slug,
    question: opportunity.question,
    tokenIds: opportunity.tokenIds,
    askYes: yes.averageFillPrice,
    askNo: no.averageFillPrice,
    totalCost,
    expectedGrossEdge: totalCost === null ? null : roundPrice(1 - totalCost),
    fillable,
    valid: fillable,
    reason: fillable ? "orderbook_validated" : "partial_basket_invalid",
    yes,
    no
  };
}

export async function validateNegRiskOpportunity(
  opportunity: NegRiskBracketOpportunity,
  targetSizeUsd: number,
  options: OpportunityValidatorOptions = {}
): Promise<ValidatedNegRiskOpportunity> {
  const fetchBook = options.fetchOrderBook ?? fetchOrderBook;
  const validations = await Promise.all(
    opportunity.legs.map(async (leg): Promise<ValidatedNegRiskLeg> => {
      const tokenId = leg.noTokenId;
      const validation = tokenId.trim()
        ? await validateTokenAsk(tokenId, targetSizeUsd, fetchBook)
        : emptyTokenValidation(tokenId);

      return {
        marketId: leg.marketId,
        slug: leg.slug,
        question: leg.question,
        tokenId,
        sideToPaperTrade: leg.sideToPaperTrade,
        averageFillPrice: validation.averageFillPrice,
        maxFillableUsd: validation.maxFillableUsd,
        bestBid: validation.bestBid,
        bestAsk: validation.bestAsk,
        fillable: validation.fillable,
        reason: validation.reason
      };
    })
  );
  const fillable = validations.every((leg) => leg.fillable);
  const executableSum = validations.every((leg) => leg.averageFillPrice !== null)
    ? roundPrice(
        validations.reduce(
          (sum, leg) => sum + (leg.averageFillPrice ?? 0),
          0
        )
      )
    : null;
  const expectedGrossEdge =
    executableSum === null
      ? null
      : roundPrice(opportunity.legs.length - 1 - executableSum);

  return {
    eventSlug: opportunity.eventSlug,
    threshold: opportunity.threshold,
    executableSum,
    expectedGrossEdge,
    fillable,
    valid: fillable,
    reason: fillable ? "orderbook_validated" : "partial_basket_invalid",
    legs: validations
  };
}

async function validateTokenAsk(
  tokenId: string,
  targetSizeUsd: number,
  fetchBook: (tokenId: string) => Promise<OrderBook>
): Promise<ValidatedTokenAsk> {
  try {
    const orderbook = await fetchBook(tokenId);
    const best = getBestBidAsk(orderbook);
    const walk = walkAsksForSize(orderbook, targetSizeUsd);

    return {
      tokenId,
      fillable: walk.fillable,
      averageFillPrice: walk.averageFillPrice,
      maxFillableUsd: walk.maxFillableUsd,
      bestBid: best.bestBid,
      bestAsk: best.bestAsk,
      reason: walk.fillable ? "fillable" : "not_fillable"
    };
  } catch {
    return {
      ...emptyTokenValidation(tokenId),
      reason: "orderbook_error"
    };
  }
}

function emptyTokenValidation(tokenId: string): ValidatedTokenAsk {
  return {
    tokenId,
    fillable: false,
    averageFillPrice: null,
    maxFillableUsd: 0,
    bestBid: null,
    bestAsk: null,
    reason: "not_fillable"
  };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
