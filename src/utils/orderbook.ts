import axios from "axios";
import {
  createConcurrencyLimiter,
  retryWithBackoff,
  withTimeout
} from "./reliability.js";

const POLYMARKET_CLOB_BOOK_URL = "https://clob.polymarket.com/book";
const ORDERBOOK_TIMEOUT_MS = 10_000;
const ORDERBOOK_MAX_CONCURRENCY = 4;

const orderbookLimiter = createConcurrencyLimiter(ORDERBOOK_MAX_CONCURRENCY);

export type OrderBookLevel = {
  price: number;
  size: number;
};

export type OrderBook = {
  tokenId?: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
};

export type BestBidAsk = {
  bestBid: number | null;
  bestAsk: number | null;
};

export type WalkAsksResult = {
  fillable: boolean;
  averageFillPrice: number | null;
  maxFillableUsd: number;
  requestedSizeUsd: number;
};

export type WalkAsksForSharesResult = {
  fillable: boolean;
  averageFillPrice: number | null;
  costUsd: number;
  requestedShares: number;
};

export type WalkBidsForSharesResult = {
  fillable: boolean;
  averageFillPrice: number | null;
  proceedsUsd: number;
  requestedShares: number;
};

type RawOrderBookLevel =
  | {
      price?: unknown;
      size?: unknown;
    }
  | [unknown, unknown];

type RawOrderBook = {
  token_id?: unknown;
  asset_id?: unknown;
  bids?: RawOrderBookLevel[];
  asks?: RawOrderBookLevel[];
};

export async function fetchOrderBook(tokenId: string): Promise<OrderBook> {
  if (!tokenId.trim()) {
    throw new Error("Cannot fetch orderbook: tokenId is required.");
  }

  try {
    const response = await orderbookLimiter.run(() =>
      retryWithBackoff(
        () =>
          withTimeout(
            axios.get<RawOrderBook>(POLYMARKET_CLOB_BOOK_URL, {
              params: {
                token_id: tokenId
              },
              timeout: ORDERBOOK_TIMEOUT_MS
            }),
            ORDERBOOK_TIMEOUT_MS + 1_000,
            `Orderbook request for token "${tokenId}" timed out.`
          ),
        { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 }
      )
    );

    return normalizeOrderBook(response.data, tokenId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch orderbook for token "${tokenId}": ${detail}`, {
      cause: error
    });
  }
}

export function getOrderbookLimiterStats(): {
  active: number;
  queued: number;
  maxConcurrency: number;
} {
  return {
    active: orderbookLimiter.getActiveCount(),
    queued: orderbookLimiter.getQueuedCount(),
    maxConcurrency: ORDERBOOK_MAX_CONCURRENCY
  };
}

export function getBestBidAsk(orderbook: OrderBook): BestBidAsk {
  const validBids = orderbook.bids.filter(isValidLevel);
  const validAsks = orderbook.asks.filter(isValidLevel);

  return {
    bestBid:
      validBids.length === 0
        ? null
        : roundPrice(Math.max(...validBids.map((level) => level.price))),
    bestAsk:
      validAsks.length === 0
        ? null
        : roundPrice(Math.min(...validAsks.map((level) => level.price)))
  };
}

export function walkAsksForSize(
  orderbook: OrderBook,
  sizeUsd: number
): WalkAsksResult {
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
    return {
      fillable: false,
      averageFillPrice: null,
      maxFillableUsd: 0,
      requestedSizeUsd: sizeUsd
    };
  }

  const asks = orderbook.asks
    .filter(isValidLevel)
    .sort((left, right) => left.price - right.price);
  const maxFillableUsd = roundUsd(
    asks.reduce((sum, level) => sum + level.price * level.size, 0)
  );

  let remainingUsd = sizeUsd;
  let spentUsd = 0;
  let shares = 0;

  for (const level of asks) {
    if (remainingUsd <= 0) {
      break;
    }

    const levelUsd = level.price * level.size;
    const spendAtLevel = Math.min(remainingUsd, levelUsd);

    spentUsd += spendAtLevel;
    shares += spendAtLevel / level.price;
    remainingUsd -= spendAtLevel;
  }

  return {
    fillable: remainingUsd <= 1e-9,
    averageFillPrice: shares === 0 ? null : roundPrice(spentUsd / shares),
    maxFillableUsd,
    requestedSizeUsd: sizeUsd
  };
}

export function walkAsksForShares(
  orderbook: OrderBook,
  shares: number
): WalkAsksForSharesResult {
  if (!Number.isFinite(shares) || shares <= 0) {
    return {
      fillable: false,
      averageFillPrice: null,
      costUsd: 0,
      requestedShares: shares
    };
  }

  const asks = orderbook.asks
    .filter(isValidLevel)
    .sort((left, right) => left.price - right.price);
  let remainingShares = shares;
  let costUsd = 0;

  for (const level of asks) {
    if (remainingShares <= 0) {
      break;
    }

    const sharesAtLevel = Math.min(remainingShares, level.size);
    costUsd += sharesAtLevel * level.price;
    remainingShares -= sharesAtLevel;
  }

  return {
    fillable: remainingShares <= 1e-9,
    averageFillPrice:
      remainingShares <= 1e-9 ? roundPrice(costUsd / shares) : null,
    costUsd: roundUsd(costUsd),
    requestedShares: shares
  };
}

export function walkBidsForShares(
  orderbook: OrderBook,
  shares: number
): WalkBidsForSharesResult {
  if (!Number.isFinite(shares) || shares <= 0) {
    return {
      fillable: false,
      averageFillPrice: null,
      proceedsUsd: 0,
      requestedShares: shares
    };
  }

  const bids = orderbook.bids
    .filter(isValidLevel)
    .sort((left, right) => right.price - left.price);
  let remainingShares = shares;
  let proceedsUsd = 0;

  for (const level of bids) {
    if (remainingShares <= 0) {
      break;
    }

    const sharesAtLevel = Math.min(remainingShares, level.size);

    proceedsUsd += sharesAtLevel * level.price;
    remainingShares -= sharesAtLevel;
  }

  return {
    fillable: remainingShares <= 1e-9,
    averageFillPrice:
      remainingShares <= 1e-9 ? roundPrice(proceedsUsd / shares) : null,
    proceedsUsd: roundUsd(proceedsUsd),
    requestedShares: shares
  };
}

function normalizeOrderBook(raw: RawOrderBook, fallbackTokenId: string): OrderBook {
  return {
    tokenId: optionalString(raw.token_id) || optionalString(raw.asset_id) || fallbackTokenId,
    bids: normalizeLevels(raw.bids),
    asks: normalizeLevels(raw.asks)
  };
}

function normalizeLevels(levels: RawOrderBookLevel[] | undefined): OrderBookLevel[] {
  if (!Array.isArray(levels)) {
    return [];
  }

  return levels.flatMap((level) => {
    const price = getLevelNumber(level, "price", 0);
    const size = getLevelNumber(level, "size", 1);

    if (!isPlausiblePrice(price) || !Number.isFinite(size) || size <= 0) {
      return [];
    }

    return [
      {
        price,
        size
      }
    ];
  });
}

function getLevelNumber(
  level: RawOrderBookLevel,
  objectKey: "price" | "size",
  tupleIndex: 0 | 1
): number {
  const value = Array.isArray(level) ? level[tupleIndex] : level[objectKey];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return Number.NaN;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isValidLevel(level: OrderBookLevel): boolean {
  return isPlausiblePrice(level.price) && Number.isFinite(level.size) && level.size > 0;
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
