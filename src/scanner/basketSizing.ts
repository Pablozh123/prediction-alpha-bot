import {
  walkAsksForShares,
  type OrderBook
} from "../utils/orderbook.js";

export type NegRiskBasketSizingLeg = {
  tokenId: string;
  slug: string;
  shares: number;
  averageFillPrice: number;
  costUsd: number;
};

export type NegRiskBasketSizing = {
  basketSizeShares: number;
  basketCostUsd: number;
  basketPayoutUsd: number;
  basketProfitUsd: number;
  edgePerShare: number;
  edgeBps: number;
  roiBps: number;
  maxPositiveBasketShares: number;
  maxPositiveBasketCostUsd: number;
  maxPositiveBasketPayoutUsd: number;
  maxPositiveBasketProfitUsd: number;
  legs: NegRiskBasketSizingLeg[];
};

export type NegRiskBasketSizingInputLeg = {
  tokenId: string;
  slug: string;
  orderbook?: OrderBook;
};

const DEFAULT_TARGET_BASKET_SHARES = 1;

export function calculateNegRiskBasketSizing(
  legs: NegRiskBasketSizingInputLeg[],
  targetBasketShares = DEFAULT_TARGET_BASKET_SHARES
): NegRiskBasketSizing | null {
  if (legs.length < 2 || !Number.isFinite(targetBasketShares)) {
    return null;
  }

  const withOrderbooks = legs.filter(
    (leg): leg is Required<NegRiskBasketSizingInputLeg> =>
      leg.orderbook !== undefined
  );

  if (withOrderbooks.length !== legs.length) {
    return null;
  }

  const maxCommonShares = Math.min(
    ...withOrderbooks.map((leg) =>
      leg.orderbook.asks.reduce((sum, level) => sum + level.size, 0)
    )
  );

  if (!Number.isFinite(maxCommonShares) || maxCommonShares <= 0) {
    return null;
  }

  const payoutPerBasketShare = legs.length - 1;
  const maxPositiveBasketShares = findMaxPositiveBasketShares(
    withOrderbooks,
    payoutPerBasketShare,
    maxCommonShares
  );

  if (maxPositiveBasketShares <= 0) {
    return null;
  }

  const safePositiveBasketShares = maxPositiveBasketShares * 0.999999;
  const basketSizeShares = roundShares(
    Math.min(Math.max(targetBasketShares, 0), safePositiveBasketShares)
  );
  const basket = calculateBasketAtShares(
    withOrderbooks,
    payoutPerBasketShare,
    basketSizeShares
  );
  const maxPositiveBasket = calculateBasketAtShares(
    withOrderbooks,
    payoutPerBasketShare,
    maxPositiveBasketShares
  );

  if (!basket || !maxPositiveBasket || basket.basketProfitUsd <= 0) {
    return null;
  }

  return {
    ...basket,
    maxPositiveBasketShares: roundShares(maxPositiveBasketShares),
    maxPositiveBasketCostUsd: maxPositiveBasket.basketCostUsd,
    maxPositiveBasketPayoutUsd: maxPositiveBasket.basketPayoutUsd,
    maxPositiveBasketProfitUsd: maxPositiveBasket.basketProfitUsd
  };
}

function findMaxPositiveBasketShares(
  legs: Required<NegRiskBasketSizingInputLeg>[],
  payoutPerBasketShare: number,
  maxCommonShares: number
): number {
  const tinyBasket = calculateBasketAtShares(
    legs,
    payoutPerBasketShare,
    Math.min(1, maxCommonShares)
  );

  if (!tinyBasket || tinyBasket.basketProfitUsd <= 0) {
    return 0;
  }

  let lower = 0;
  let upper = maxCommonShares;

  for (let index = 0; index < 80; index += 1) {
    const mid = (lower + upper) / 2;
    const basket = calculateBasketAtShares(legs, payoutPerBasketShare, mid);

    if (basket && basket.basketProfitUsd >= 0) {
      lower = mid;
    } else {
      upper = mid;
    }
  }

  return lower;
}

function calculateBasketAtShares(
  legs: Required<NegRiskBasketSizingInputLeg>[],
  payoutPerBasketShare: number,
  basketSizeShares: number
):
  | Omit<
      NegRiskBasketSizing,
      | "maxPositiveBasketShares"
      | "maxPositiveBasketCostUsd"
      | "maxPositiveBasketPayoutUsd"
      | "maxPositiveBasketProfitUsd"
    >
  | null {
  if (!Number.isFinite(basketSizeShares) || basketSizeShares <= 0) {
    return null;
  }

  const legSizing: NegRiskBasketSizingLeg[] = [];

  for (const leg of legs) {
    const walk = walkAsksForShares(leg.orderbook, basketSizeShares);

    if (!walk.fillable || walk.averageFillPrice === null) {
      return null;
    }

    legSizing.push({
      tokenId: leg.tokenId,
      slug: leg.slug,
      shares: roundShares(basketSizeShares),
      averageFillPrice: walk.averageFillPrice,
      costUsd: walk.costUsd
    });
  }

  const basketCostUsd = roundUsd(
    legSizing.reduce((sum, leg) => sum + leg.costUsd, 0)
  );
  const basketPayoutUsd = roundUsd(payoutPerBasketShare * basketSizeShares);
  const basketProfitUsd = roundUsd(basketPayoutUsd - basketCostUsd);
  const edgePerShare = roundPrice(
    basketPayoutUsd / basketSizeShares - basketCostUsd / basketSizeShares
  );
  const roi = basketCostUsd > 0 ? basketProfitUsd / basketCostUsd : 0;

  return {
    basketSizeShares: roundShares(basketSizeShares),
    basketCostUsd,
    basketPayoutUsd,
    basketProfitUsd,
    edgePerShare,
    edgeBps: roundBps(edgePerShare * 10_000),
    roiBps: roundBps(roi * 10_000),
    legs: legSizing
  };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundShares(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function roundBps(value: number): number {
  return Math.round(value * 100) / 100;
}
