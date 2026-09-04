import type { NegRiskBracketOpportunity } from "./negRiskBracketScanner.js";
import type { WithinMarketArbOpportunity } from "./withinMarketArbScanner.js";
import {
  fetchOrderBook,
  getBestBidAsk,
  walkAsksForShares,
  walkAsksForSize,
  type OrderBook,
} from "../utils/orderbook.js";
import {
  calculateNegRiskBasketSizing,
  type NegRiskBasketSizing,
} from "./basketSizing.js";

export type OpportunityValidationReason =
  | "orderbook_validated"
  | "partial_basket_invalid"
  | "invalid_token_ids";

export type ValidatedTokenAsk = {
  tokenId: string;
  fillable: boolean;
  averageFillPrice: number | null;
  maxFillableUsd: number;
  /** Total shares resting on the ask side; the leg's depth in shares. */
  depthShares: number;
  bestBid: number | null;
  bestAsk: number | null;
  reason: "fillable" | "not_fillable" | "orderbook_error";
  orderbook?: OrderBook;
};

export type ValidatedWithinMarketOpportunity = {
  slug: string;
  question: string;
  tokenIds: {
    yes: string;
    no: string;
  };
  category?: string | null;
  askYes: number | null;
  askNo: number | null;
  totalCost: number | null;
  expectedGrossEdge: number | null;
  fillableUsd: number;
  minLegDepthUsd: number;
  legCount: number;
  executableSum: number | null;
  feeAdjustedEdge: number | null;
  /** Shares the target size asked for at the quoted prices. */
  targetShares?: number;
  /** Shares both legs can actually fill; the size every number above is priced at. */
  executableShares?: number;
  /** True when the book, not the target, decided the size. */
  depthLimited?: boolean;
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
  orderbook?: OrderBook;
};

export type ValidatedNegRiskOpportunity = {
  eventSlug: string;
  threshold: number;
  executableSum: number | null;
  expectedGrossEdge: number | null;
  fillableUsd: number;
  minLegDepthUsd: number;
  legCount: number;
  feeAdjustedEdge: number | null;
  basketSizing?: NegRiskBasketSizing | null;
  targetShares?: number;
  fillable: boolean;
  valid: boolean;
  reason: OpportunityValidationReason;
  legs: ValidatedNegRiskLeg[];
};

export type OpportunityValidatorOptions = {
  fetchOrderBook?: (tokenId: string) => Promise<OrderBook>;
};

/**
 * Price a within-market YES+NO basket against the book that would fill it.
 *
 * `targetSizeUsd` is the capital the paper trade wants to deploy. It is turned
 * into a share count at the quoted prices, then both ask ladders are walked
 * for that many shares. If either book is shallower, the basket is priced at
 * the common fillable size instead and flagged `depthLimited`: the quoted edge
 * is only a pre-filter, the walked prices are the numbers that count.
 */
export async function validateWithinMarketOpportunity(
  opportunity: WithinMarketArbOpportunity,
  targetSizeUsd: number,
  options: OpportunityValidatorOptions = {},
): Promise<ValidatedWithinMarketOpportunity> {
  const fetchBook = options.fetchOrderBook ?? fetchOrderBook;
  const yesTokenId = opportunity.tokenIds.yes;
  const noTokenId = opportunity.tokenIds.no;
  const category = opportunity.category ?? null;

  if (!yesTokenId.trim() || !noTokenId.trim()) {
    const emptyYes = emptyTokenValidation(yesTokenId);
    const emptyNo = emptyTokenValidation(noTokenId);

    return {
      slug: opportunity.slug,
      question: opportunity.question,
      tokenIds: opportunity.tokenIds,
      category,
      askYes: null,
      askNo: null,
      totalCost: null,
      expectedGrossEdge: null,
      fillableUsd: 0,
      minLegDepthUsd: 0,
      legCount: 2,
      executableSum: null,
      feeAdjustedEdge: null,
      targetShares: 0,
      executableShares: 0,
      depthLimited: false,
      fillable: false,
      valid: false,
      reason: "invalid_token_ids",
      yes: emptyYes,
      no: emptyNo,
    };
  }

  const quotedSum = opportunity.askYes + opportunity.askNo;
  const targetShares =
    Number.isFinite(quotedSum) && quotedSum > 0 && targetSizeUsd > 0
      ? floorShares(targetSizeUsd / quotedSum)
      : 0;

  const [yesBase, noBase] = await Promise.all([
    validateTokenAsk(yesTokenId, targetSizeUsd, fetchBook),
    validateTokenAsk(noTokenId, targetSizeUsd, fetchBook),
  ]);
  const executableShares = floorShares(
    Math.min(targetShares, yesBase.depthShares, noBase.depthShares),
  );
  const depthLimited = executableShares > 0 && executableShares < targetShares;
  const yes = repriceAtShares(yesBase, executableShares);
  const no = repriceAtShares(noBase, executableShares);
  const fillable = yes.fillable && no.fillable && executableShares > 0;
  const totalCost =
    yes.averageFillPrice === null || no.averageFillPrice === null
      ? null
      : roundPrice(yes.averageFillPrice + no.averageFillPrice);
  const expectedGrossEdge =
    totalCost === null ? null : roundPrice(1 - totalCost);
  const minLegDepthUsd = roundPrice(
    Math.min(yes.maxFillableUsd, no.maxFillableUsd),
  );

  return {
    slug: opportunity.slug,
    question: opportunity.question,
    tokenIds: opportunity.tokenIds,
    category,
    askYes: yes.averageFillPrice,
    askNo: no.averageFillPrice,
    totalCost,
    expectedGrossEdge,
    fillableUsd:
      totalCost === null ? 0 : roundPrice(executableShares * totalCost),
    minLegDepthUsd,
    legCount: 2,
    executableSum: totalCost,
    feeAdjustedEdge: expectedGrossEdge,
    targetShares,
    executableShares,
    depthLimited,
    fillable,
    valid: fillable,
    reason: fillable ? "orderbook_validated" : "partial_basket_invalid",
    yes,
    no,
  };
}

/**
 * Price a NEG_RISK NO basket against every leg's book. The basket is sized at
 * the share count the target capital buys (payout per basket share is
 * legs - 1), capped by `calculateNegRiskBasketSizing` at the largest size that
 * still has positive gross profit.
 */
export async function validateNegRiskOpportunity(
  opportunity: NegRiskBracketOpportunity,
  targetSizeUsd: number,
  options: OpportunityValidatorOptions = {},
): Promise<ValidatedNegRiskOpportunity> {
  const fetchBook = options.fetchOrderBook ?? fetchOrderBook;
  const payoutPerBasketShare = Math.max(1, opportunity.legs.length - 1);
  const targetShares = floorShares(Math.max(0, targetSizeUsd) / payoutPerBasketShare);
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
        reason: validation.reason,
        orderbook: validation.orderbook,
      };
    }),
  );
  const fillable = validations.every((leg) => leg.fillable);
  const executableSum = validations.every(
    (leg) => leg.averageFillPrice !== null,
  )
    ? roundPrice(
        validations.reduce((sum, leg) => sum + (leg.averageFillPrice ?? 0), 0),
      )
    : null;
  const expectedGrossEdge =
    executableSum === null
      ? null
      : roundPrice(opportunity.legs.length - 1 - executableSum);
  const minLegDepthUsd =
    validations.length === 0
      ? 0
      : roundPrice(Math.min(...validations.map((leg) => leg.maxFillableUsd)));

  return {
    eventSlug: opportunity.eventSlug,
    threshold: opportunity.threshold,
    executableSum,
    expectedGrossEdge,
    fillableUsd: roundPrice(minLegDepthUsd * validations.length),
    minLegDepthUsd,
    legCount: validations.length,
    feeAdjustedEdge: expectedGrossEdge,
    targetShares,
    basketSizing: fillable
      ? calculateNegRiskBasketSizing(
          validations.map((leg) => ({
            tokenId: leg.tokenId,
            slug: leg.slug,
            orderbook: leg.orderbook,
          })),
          Math.max(1, targetShares),
        )
      : null,
    fillable,
    valid: fillable,
    reason: fillable ? "orderbook_validated" : "partial_basket_invalid",
    legs: validations,
  };
}

async function validateTokenAsk(
  tokenId: string,
  targetSizeUsd: number,
  fetchBook: (tokenId: string) => Promise<OrderBook>,
): Promise<ValidatedTokenAsk> {
  try {
    const orderbook = await fetchBook(tokenId);
    const best = getBestBidAsk(orderbook);
    const sizeWalk = walkAsksForSize(orderbook, targetSizeUsd);
    const shareWalk = walkAsksForShares(orderbook, 1);
    const depthShares = orderbook.asks
      .filter(
        (level) =>
          Number.isFinite(level.price) &&
          level.price > 0 &&
          level.price < 1 &&
          Number.isFinite(level.size) &&
          level.size > 0,
      )
      .reduce((sum, level) => sum + level.size, 0);

    return {
      tokenId,
      fillable: shareWalk.fillable,
      averageFillPrice: shareWalk.averageFillPrice ?? sizeWalk.averageFillPrice,
      maxFillableUsd: sizeWalk.maxFillableUsd,
      depthShares: roundShares(depthShares),
      bestBid: best.bestBid,
      bestAsk: best.bestAsk,
      reason: shareWalk.fillable ? "fillable" : "not_fillable",
      orderbook,
    };
  } catch {
    return {
      ...emptyTokenValidation(tokenId),
      reason: "orderbook_error",
    };
  }
}

function repriceAtShares(
  token: ValidatedTokenAsk,
  shares: number,
): ValidatedTokenAsk {
  if (!token.orderbook || shares <= 0) {
    return { ...token, fillable: false, reason: token.reason === "orderbook_error" ? "orderbook_error" : "not_fillable" };
  }

  const walk = walkAsksForShares(token.orderbook, shares);

  return {
    ...token,
    fillable: walk.fillable,
    averageFillPrice: walk.averageFillPrice ?? token.averageFillPrice,
    reason: walk.fillable ? "fillable" : "not_fillable",
  };
}

function emptyTokenValidation(tokenId: string): ValidatedTokenAsk {
  return {
    tokenId,
    fillable: false,
    averageFillPrice: null,
    maxFillableUsd: 0,
    depthShares: 0,
    bestBid: null,
    bestAsk: null,
    reason: "not_fillable",
  };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundShares(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Floor to four decimals: the CLOB counts microshares, rounding up rejects. */
function floorShares(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value * 10_000) / 10_000;
}
