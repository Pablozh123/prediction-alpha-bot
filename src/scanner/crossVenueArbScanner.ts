import { fetchKalshiOrderBook, type KalshiOrderBook } from "../utils/kalshi.js";
import {
  fetchOrderBook,
  getBestBidAsk,
  type OrderBook,
  type OrderBookLevel,
} from "../utils/orderbook.js";
import type {
  CanonicalEvent,
  CanonicalOutcome,
} from "./canonicalPredictionMarket.js";
import type { LiveOrderBookCache } from "./liveOrderbookCache.js";

export const CROSS_VENUE_ARB_STRATEGY = "cross_venue_yes_no_arb";
export const CROSS_VENUE_PRICE_SPREAD_STRATEGY = "cross_venue_price_spread";
export const DEFAULT_CROSS_VENUE_MIN_NET_CENTS = 0.5;

export type CrossVenue = "kalshi" | "polymarket";

export type CrossVenuePair = {
  id: string;
  title: string;
  outcomeLabel: string;
  category?: string;
  enabled?: boolean;
  priority?: boolean;
  verified?: boolean;
  note?: string;
  expectedResolutionAt?: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  canonicalEvent?: CanonicalEvent;
  canonicalOutcome?: CanonicalOutcome;
  kalshi: {
    ticker: string;
    liquidityDollars?: number | null;
    volume24h?: number | null;
  };
  polymarket: {
    slug: string;
    yesTokenId: string;
    noTokenId: string;
    liquidityDollars?: number | null;
    volume24h?: number | null;
  };
};

export type CrossVenueFeeConfig = Partial<Record<CrossVenue, number>>;

export type CrossVenueBook = {
  venue: CrossVenue;
  identifier: string;
  yesAskLevels: OrderBookLevel[];
  noAskLevels: OrderBookLevel[];
  bestYesAsk: number | null;
  bestNoAsk: number | null;
};

export type CrossVenueArbLeg = {
  venue: CrossVenue;
  side: "YES" | "NO";
  identifier: string;
  bestAsk: number;
  averageFillPrice: number;
};

export type CrossVenueArbOpportunity = {
  pairId: string;
  title: string;
  outcomeLabel: string;
  slug: string;
  buyYesVenue: CrossVenue;
  buyNoVenue: CrossVenue;
  grossCents: number;
  feeCents: number;
  netCents: number;
  roiBps: number;
  totalTopOfBookCost: number;
  executableSize: number;
  maxProfitDollars: number;
  category?: string;
  expectedResolutionAt?: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  reason: "cross_venue_yes_no_below_one";
  yesLeg: CrossVenueArbLeg;
  noLeg: CrossVenueArbLeg;
};

export type CrossVenuePriceSpread = {
  pairId: string;
  title: string;
  outcomeLabel: string;
  kalshiTicker?: string;
  polymarketSlug?: string;
  side: "YES" | "NO";
  cheapVenue: CrossVenue;
  richVenue: CrossVenue;
  cheapPrice: number;
  richPrice: number;
  diffCents: number;
  category?: string;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  reason: "same_outcome_price_difference";
};

export type ScanCrossVenuePairsOptions = {
  fetchKalshiBook?: (ticker: string) => Promise<KalshiOrderBook>;
  fetchPolymarketBook?: (tokenId: string) => Promise<OrderBook>;
  orderbookCache?: LiveOrderBookCache;
  orderbookCacheMaxAgeMs?: number;
  feesCents?: CrossVenueFeeConfig;
  minNetCents?: number;
  warn?: (message: string) => void;
};

export type CrossVenueOrderbookReadStats = {
  reads: number;
  dedupedReads: number;
  cacheHits: number;
  liveWatchedHits: number;
  websocketHits: number;
  restHits: number;
  missingCacheMisses: number;
  staleCacheMisses: number;
  cacheUnavailable: number;
  restFetches: number;
  restWrites: number;
};

export type CrossVenueOrderbookReadMetrics = {
  kalshi: CrossVenueOrderbookReadStats;
  polymarket: CrossVenueOrderbookReadStats;
  total: CrossVenueOrderbookReadStats;
};

type CrossVenueOrderbookReadMemo = {
  kalshi: Map<string, Promise<KalshiOrderBook>>;
  polymarket: Map<string, Promise<OrderBook>>;
};

export type CrossVenueScanResult = {
  opportunities: CrossVenueArbOpportunity[];
  priceSpreads: CrossVenuePriceSpread[];
  rejected: Array<{
    pairId: string;
    reason: string;
  }>;
  orderbookReads: CrossVenueOrderbookReadMetrics;
};

export async function scanCrossVenuePairs(
  pairs: CrossVenuePair[],
  options: ScanCrossVenuePairsOptions = {},
): Promise<CrossVenueScanResult> {
  const fetchKalshiBook = options.fetchKalshiBook ?? fetchKalshiOrderBook;
  const fetchPolymarketBook = options.fetchPolymarketBook ?? fetchOrderBook;
  const warn = options.warn ?? console.warn;
  const opportunities: CrossVenueArbOpportunity[] = [];
  const priceSpreads: CrossVenuePriceSpread[] = [];
  const rejected: CrossVenueScanResult["rejected"] = [];
  const orderbookReads = emptyCrossVenueOrderbookReadMetrics();
  const readMemo: CrossVenueOrderbookReadMemo = {
    kalshi: new Map(),
    polymarket: new Map(),
  };

  for (const pair of pairs) {
    try {
      validatePair(pair);
      const [kalshiBook, polymarketYesBook, polymarketNoBook] =
        await Promise.all([
          readKalshiBookOnce(pair.kalshi.ticker, {
            cache: options.orderbookCache,
            fetchKalshiBook,
            maxAgeMs: options.orderbookCacheMaxAgeMs,
            memo: readMemo,
            stats: orderbookReads.kalshi,
          }),
          readPolymarketBookOnce(pair.polymarket.yesTokenId, {
            cache: options.orderbookCache,
            fetchPolymarketBook,
            maxAgeMs: options.orderbookCacheMaxAgeMs,
            memo: readMemo,
            stats: orderbookReads.polymarket,
          }),
          readPolymarketBookOnce(pair.polymarket.noTokenId, {
            cache: options.orderbookCache,
            fetchPolymarketBook,
            maxAgeMs: options.orderbookCacheMaxAgeMs,
            memo: readMemo,
            stats: orderbookReads.polymarket,
          }),
        ]);
      const books = [
        buildKalshiCrossVenueBook(kalshiBook),
        buildPolymarketCrossVenueBook(pair, polymarketYesBook, polymarketNoBook),
      ];

      opportunities.push(
        ...calculateCrossVenueArbs(pair, books, {
          feesCents: options.feesCents,
          minNetCents: options.minNetCents,
        }),
      );
      priceSpreads.push(...calculateCrossVenuePriceSpreads(pair, books));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      rejected.push({ pairId: pair.id, reason: detail });
      warn(`Skipping cross-venue pair "${pair.id}": ${detail}`);
    }
  }

  return {
    opportunities: opportunities.sort(
      (left, right) =>
        right.netCents - left.netCents ||
        right.maxProfitDollars - left.maxProfitDollars ||
        left.pairId.localeCompare(right.pairId),
    ),
    priceSpreads: priceSpreads.sort(
      (left, right) =>
        right.diffCents - left.diffCents || left.pairId.localeCompare(right.pairId),
    ),
    rejected,
    orderbookReads: finalizeCrossVenueOrderbookReadMetrics(orderbookReads),
  };
}

function readKalshiBookOnce(
  ticker: string,
  options: {
    cache?: LiveOrderBookCache;
    fetchKalshiBook: (ticker: string) => Promise<KalshiOrderBook>;
    maxAgeMs?: number;
    memo: CrossVenueOrderbookReadMemo;
    stats: CrossVenueOrderbookReadStats;
  },
): Promise<KalshiOrderBook> {
  const key = ticker.trim();
  const existing = options.memo.kalshi.get(key);

  if (existing) {
    options.stats.dedupedReads += 1;
    return existing;
  }

  const promise = readKalshiBook(key, options);
  options.memo.kalshi.set(key, promise);

  return promise;
}

async function readKalshiBook(
  ticker: string,
  options: {
    cache?: LiveOrderBookCache;
    fetchKalshiBook: (ticker: string) => Promise<KalshiOrderBook>;
    maxAgeMs?: number;
    stats: CrossVenueOrderbookReadStats;
  },
): Promise<KalshiOrderBook> {
  options.stats.reads += 1;
  const cached = options.cache?.getKalshiBook(ticker, options.maxAgeMs);

  if (cached && !cached.stale) {
    recordOrderbookCacheHit(options.stats, cached.source, cached.liveWatched);
    return cached.orderbook;
  }

  recordOrderbookCacheMiss(options.stats, Boolean(options.cache), cached?.stale);
  const orderbook = await options.fetchKalshiBook(ticker);
  options.stats.restFetches += 1;
  options.cache?.setKalshiBook(ticker, orderbook, "rest");
  if (options.cache) {
    options.stats.restWrites += 1;
  }

  return orderbook;
}

function readPolymarketBookOnce(
  tokenId: string,
  options: {
    cache?: LiveOrderBookCache;
    fetchPolymarketBook: (tokenId: string) => Promise<OrderBook>;
    maxAgeMs?: number;
    memo: CrossVenueOrderbookReadMemo;
    stats: CrossVenueOrderbookReadStats;
  },
): Promise<OrderBook> {
  const key = tokenId.trim();
  const existing = options.memo.polymarket.get(key);

  if (existing) {
    options.stats.dedupedReads += 1;
    return existing;
  }

  const promise = readPolymarketBook(key, options);
  options.memo.polymarket.set(key, promise);

  return promise;
}

async function readPolymarketBook(
  tokenId: string,
  options: {
    cache?: LiveOrderBookCache;
    fetchPolymarketBook: (tokenId: string) => Promise<OrderBook>;
    maxAgeMs?: number;
    stats: CrossVenueOrderbookReadStats;
  },
): Promise<OrderBook> {
  options.stats.reads += 1;
  const cached = options.cache?.getPolymarketBook(tokenId, options.maxAgeMs);

  if (cached && !cached.stale) {
    recordOrderbookCacheHit(options.stats, cached.source, cached.liveWatched);
    return cached.orderbook;
  }

  recordOrderbookCacheMiss(options.stats, Boolean(options.cache), cached?.stale);
  const orderbook = await options.fetchPolymarketBook(tokenId);
  options.stats.restFetches += 1;
  options.cache?.setPolymarketBook(tokenId, orderbook, "rest");
  if (options.cache) {
    options.stats.restWrites += 1;
  }

  return orderbook;
}

export function emptyCrossVenueOrderbookReadMetrics(): CrossVenueOrderbookReadMetrics {
  return finalizeCrossVenueOrderbookReadMetrics({
    kalshi: emptyOrderbookReadStats(),
    polymarket: emptyOrderbookReadStats(),
    total: emptyOrderbookReadStats(),
  });
}

function emptyOrderbookReadStats(): CrossVenueOrderbookReadStats {
  return {
    reads: 0,
    dedupedReads: 0,
    cacheHits: 0,
    liveWatchedHits: 0,
    websocketHits: 0,
    restHits: 0,
    missingCacheMisses: 0,
    staleCacheMisses: 0,
    cacheUnavailable: 0,
    restFetches: 0,
    restWrites: 0,
  };
}

function recordOrderbookCacheHit(
  stats: CrossVenueOrderbookReadStats,
  source: "rest" | "websocket",
  liveWatched: boolean,
): void {
  stats.cacheHits += 1;
  if (liveWatched) {
    stats.liveWatchedHits += 1;
  }
  if (source === "websocket") {
    stats.websocketHits += 1;
  } else {
    stats.restHits += 1;
  }
}

function recordOrderbookCacheMiss(
  stats: CrossVenueOrderbookReadStats,
  cacheConfigured: boolean,
  stale: boolean | undefined,
): void {
  if (!cacheConfigured) {
    stats.cacheUnavailable += 1;
    return;
  }

  if (stale) {
    stats.staleCacheMisses += 1;
  } else {
    stats.missingCacheMisses += 1;
  }
}

function finalizeCrossVenueOrderbookReadMetrics(
  metrics: CrossVenueOrderbookReadMetrics,
): CrossVenueOrderbookReadMetrics {
  return {
    kalshi: { ...metrics.kalshi },
    polymarket: { ...metrics.polymarket },
    total: sumOrderbookReadStats(metrics.kalshi, metrics.polymarket),
  };
}

function sumOrderbookReadStats(
  left: CrossVenueOrderbookReadStats,
  right: CrossVenueOrderbookReadStats,
): CrossVenueOrderbookReadStats {
  return {
    reads: left.reads + right.reads,
    dedupedReads: left.dedupedReads + right.dedupedReads,
    cacheHits: left.cacheHits + right.cacheHits,
    liveWatchedHits: left.liveWatchedHits + right.liveWatchedHits,
    websocketHits: left.websocketHits + right.websocketHits,
    restHits: left.restHits + right.restHits,
    missingCacheMisses: left.missingCacheMisses + right.missingCacheMisses,
    staleCacheMisses: left.staleCacheMisses + right.staleCacheMisses,
    cacheUnavailable: left.cacheUnavailable + right.cacheUnavailable,
    restFetches: left.restFetches + right.restFetches,
    restWrites: left.restWrites + right.restWrites,
  };
}

export function calculateCrossVenueArbs(
  pair: CrossVenuePair,
  books: CrossVenueBook[],
  options: {
    feesCents?: CrossVenueFeeConfig;
    minNetCents?: number;
  } = {},
): CrossVenueArbOpportunity[] {
  const minNetCents = options.minNetCents ?? DEFAULT_CROSS_VENUE_MIN_NET_CENTS;
  const opportunities: CrossVenueArbOpportunity[] = [];

  for (const yesBook of books) {
    for (const noBook of books) {
      if (yesBook.venue === noBook.venue) {
        continue;
      }

      const yesBestAsk = yesBook.bestYesAsk;
      const noBestAsk = noBook.bestNoAsk;

      if (yesBestAsk === null || noBestAsk === null) {
        continue;
      }

      const feeCents =
        feeForVenue(yesBook.venue, options.feesCents) +
        feeForVenue(noBook.venue, options.feesCents);
      const totalTopOfBookCost = roundPrice(yesBestAsk + noBestAsk);
      const grossCents = roundCents((1 - totalTopOfBookCost) * 100);
      const netCents = roundCents(grossCents - feeCents);

      if (netCents < minNetCents) {
        continue;
      }

      const ladder = walkCrossVenueAskLadders(
        yesBook.yesAskLevels,
        noBook.noAskLevels,
        feeCents,
      );

      if (ladder.executableSize <= 0 || ladder.maxProfitDollars <= 0) {
        continue;
      }

      opportunities.push({
        pairId: pair.id,
        title: pair.title,
        outcomeLabel: pair.outcomeLabel,
        slug: pair.polymarket.slug,
        buyYesVenue: yesBook.venue,
        buyNoVenue: noBook.venue,
        grossCents,
        feeCents,
        netCents,
        roiBps: roundBps((netCents / 100 / totalTopOfBookCost) * 10_000),
        totalTopOfBookCost,
        executableSize: ladder.executableSize,
        maxProfitDollars: ladder.maxProfitDollars,
        ...(pair.category ? { category: pair.category } : {}),
        ...(pair.expectedResolutionAt
          ? { expectedResolutionAt: pair.expectedResolutionAt }
          : {}),
        ...(pair.liquidityDollars !== undefined
          ? { liquidityDollars: pair.liquidityDollars }
          : {}),
        ...(pair.volume24h !== undefined ? { volume24h: pair.volume24h } : {}),
        reason: "cross_venue_yes_no_below_one",
        yesLeg: {
          venue: yesBook.venue,
          side: "YES",
          identifier: yesBook.identifier,
          bestAsk: yesBestAsk,
          averageFillPrice: ladder.yesAverageFillPrice,
        },
        noLeg: {
          venue: noBook.venue,
          side: "NO",
          identifier: noBook.identifier,
          bestAsk: noBestAsk,
          averageFillPrice: ladder.noAverageFillPrice,
        },
      });
    }
  }

  return opportunities;
}

export function calculateCrossVenuePriceSpreads(
  pair: CrossVenuePair,
  books: CrossVenueBook[],
): CrossVenuePriceSpread[] {
  const [left, right] = books;

  if (!left || !right) {
    return [];
  }

  return [
    buildPriceSpread(pair, "YES", left, right),
    buildPriceSpread(pair, "NO", left, right),
  ].filter((spread): spread is CrossVenuePriceSpread => spread !== null);
}

export function buildKalshiCrossVenueBook(
  orderbook: KalshiOrderBook,
): CrossVenueBook {
  return {
    venue: "kalshi",
    identifier: orderbook.ticker,
    yesAskLevels: orderbook.yesAsks,
    noAskLevels: orderbook.noAsks,
    bestYesAsk: bestAsk(orderbook.yesAsks),
    bestNoAsk: bestAsk(orderbook.noAsks),
  };
}

export function buildPolymarketCrossVenueBook(
  pair: CrossVenuePair,
  yesBook: OrderBook,
  noBook: OrderBook,
): CrossVenueBook {
  return {
    venue: "polymarket",
    identifier: pair.polymarket.slug,
    yesAskLevels: normalizeAskLevels(yesBook.asks),
    noAskLevels: normalizeAskLevels(noBook.asks),
    bestYesAsk: getBestBidAsk(yesBook).bestAsk,
    bestNoAsk: getBestBidAsk(noBook).bestAsk,
  };
}

export function walkCrossVenueAskLadders(
  yesAskLevels: OrderBookLevel[],
  noAskLevels: OrderBookLevel[],
  feeCents: number,
): {
  executableSize: number;
  maxProfitDollars: number;
  yesAverageFillPrice: number;
  noAverageFillPrice: number;
} {
  const yesAsks = normalizeAskLevels(yesAskLevels);
  const noAsks = normalizeAskLevels(noAskLevels);
  let yesIndex = 0;
  let noIndex = 0;
  let yesRemaining = yesAsks[0]?.size ?? 0;
  let noRemaining = noAsks[0]?.size ?? 0;
  let executableSize = 0;
  let maxProfitDollars = 0;
  let yesCost = 0;
  let noCost = 0;

  while (yesIndex < yesAsks.length && noIndex < noAsks.length) {
    const yes = yesAsks[yesIndex];
    const no = noAsks[noIndex];

    if (!yes || !no) {
      break;
    }

    const netCents = roundCents((1 - yes.price - no.price) * 100 - feeCents);

    if (netCents <= 0) {
      break;
    }

    const shares = Math.min(yesRemaining, noRemaining);

    executableSize += shares;
    maxProfitDollars += (netCents / 100) * shares;
    yesCost += yes.price * shares;
    noCost += no.price * shares;
    yesRemaining -= shares;
    noRemaining -= shares;

    if (yesRemaining <= 1e-9) {
      yesIndex += 1;
      yesRemaining = yesAsks[yesIndex]?.size ?? 0;
    }

    if (noRemaining <= 1e-9) {
      noIndex += 1;
      noRemaining = noAsks[noIndex]?.size ?? 0;
    }
  }

  return {
    executableSize: roundSize(executableSize),
    maxProfitDollars: roundUsd(maxProfitDollars),
    yesAverageFillPrice:
      executableSize === 0 ? 0 : roundPrice(yesCost / executableSize),
    noAverageFillPrice:
      executableSize === 0 ? 0 : roundPrice(noCost / executableSize),
  };
}

function buildPriceSpread(
  pair: CrossVenuePair,
  side: "YES" | "NO",
  left: CrossVenueBook,
  right: CrossVenueBook,
): CrossVenuePriceSpread | null {
  const leftPrice = side === "YES" ? left.bestYesAsk : left.bestNoAsk;
  const rightPrice = side === "YES" ? right.bestYesAsk : right.bestNoAsk;

  if (leftPrice === null || rightPrice === null) {
    return null;
  }

  const leftIsCheap = leftPrice <= rightPrice;

  return {
    pairId: pair.id,
    title: pair.title,
    outcomeLabel: pair.outcomeLabel,
    kalshiTicker: pair.kalshi.ticker,
    polymarketSlug: pair.polymarket.slug,
    side,
    cheapVenue: leftIsCheap ? left.venue : right.venue,
    richVenue: leftIsCheap ? right.venue : left.venue,
    cheapPrice: leftIsCheap ? leftPrice : rightPrice,
    richPrice: leftIsCheap ? rightPrice : leftPrice,
    diffCents: roundCents(Math.abs(leftPrice - rightPrice) * 100),
    ...(pair.category ? { category: pair.category } : {}),
    ...(pair.liquidityDollars !== undefined
      ? { liquidityDollars: pair.liquidityDollars }
      : {}),
    ...(pair.volume24h !== undefined ? { volume24h: pair.volume24h } : {}),
    reason: "same_outcome_price_difference",
  };
}

function normalizeAskLevels(levels: OrderBookLevel[]): OrderBookLevel[] {
  return levels
    .filter((level) => isPlausiblePrice(level.price) && level.size > 0)
    .map((level) => ({ price: roundPrice(level.price), size: level.size }))
    .sort((left, right) => left.price - right.price);
}

function bestAsk(levels: OrderBookLevel[]): number | null {
  const asks = normalizeAskLevels(levels);

  return asks[0]?.price ?? null;
}

function feeForVenue(
  venue: CrossVenue,
  feesCents: CrossVenueFeeConfig | undefined,
): number {
  const fee = feesCents?.[venue] ?? 0;

  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

function validatePair(pair: CrossVenuePair): void {
  if (!pair.id.trim() || !pair.title.trim() || !pair.outcomeLabel.trim()) {
    throw new Error("pair id, title, and outcomeLabel are required.");
  }

  if (!pair.kalshi.ticker.trim()) {
    throw new Error("Kalshi ticker is required.");
  }

  if (
    !pair.polymarket.slug.trim() ||
    !pair.polymarket.yesTokenId.trim() ||
    !pair.polymarket.noTokenId.trim()
  ) {
    throw new Error("Polymarket slug, yesTokenId, and noTokenId are required.");
  }
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundBps(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundSize(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
