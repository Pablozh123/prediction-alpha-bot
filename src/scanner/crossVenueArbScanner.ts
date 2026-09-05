import { fetchKalshiOrderBook, type KalshiOrderBook } from "../utils/kalshi.js";
import {
  fetchOrderBook,
  getBestBidAsk,
  type OrderBook,
  type OrderBookLevel,
} from "../utils/orderbook.js";
import {
  computeBasketEconomics,
  type BasketEconomics,
} from "../core/opportunityEconomics.js";
import type { RejectionReason } from "../core/rejectionReasons.js";
import {
  assignLegRoles,
  FEE_MODEL_VERSION,
  legFeeRate,
  type ExecutionRoleMode,
  type LegRole,
} from "../core/venueFees.js";
import type {
  CanonicalEvent,
  CanonicalOutcome,
} from "./canonicalPredictionMarket.js";
import { classifyQuestionMismatch } from "./crossVenueQuestionMatch.js";
import type { LiveOrderBookCache } from "./liveOrderbookCache.js";

export const CROSS_VENUE_ARB_STRATEGY = "cross_venue_yes_no_arb";
export const CROSS_VENUE_PRICE_SPREAD_STRATEGY = "cross_venue_price_spread";
export const DEFAULT_CROSS_VENUE_MIN_NET_CENTS = 0.5;

export type CrossVenue = "kalshi" | "polymarket";

/**
 * What a person decided after reading both rulebooks (stage 3 of the pair
 * protocol in docs/ARB_TAXONOMY.md). `pending` is a draft nobody confirmed
 * and counts as no review for every economic purpose. The checklist keys
 * are the seven questions of the protocol; a `false` needs a note.
 */
export type CrossVenuePairReview = {
  verdict: "pending" | "equivalent" | "not_equivalent";
  date?: string;
  reviewer?: string;
  note?: string;
  checklist?: Record<string, boolean | string>;
  source?: string;
};

export type CrossVenuePair = {
  id: string;
  title: string;
  outcomeLabel: string;
  category?: string;
  enabled?: boolean;
  priority?: boolean;
  /**
   * Legacy flag of the 2026-06 pair configs. It was set by the discovery
   * review, not by a rules review, and no longer promotes a pair: the loader
   * turns it into a `pending` review so the history stays visible.
   */
  verified?: boolean;
  review?: CrossVenuePairReview;
  note?: string;
  expectedResolutionAt?: number | null;
  liquidityDollars?: number | null;
  volume24h?: number | null;
  canonicalEvent?: CanonicalEvent;
  canonicalOutcome?: CanonicalOutcome;
  kalshi: {
    ticker: string;
    /** Kalshi title (+ subtitle); lets the question-type check run. */
    title?: string;
    /** Kalshi's own resolution time; published next to Polymarket's. */
    expectedResolutionAt?: number | null;
    /** Primary and secondary rules, for the excerpt on the pair board. */
    rulesText?: string;
    liquidityDollars?: number | null;
    volume24h?: number | null;
  };
  polymarket: {
    slug: string;
    /** Polymarket question text; lets the question-type check run. */
    question?: string;
    yesTokenId: string;
    noTokenId: string;
    expectedResolutionAt?: number | null;
    rulesText?: string;
    resolutionSource?: string;
    liquidityDollars?: number | null;
    volume24h?: number | null;
  };
};

/** Flat cents per share per venue. Legacy; zero means "not configured". */
export type CrossVenueFeeConfig = Partial<Record<CrossVenue, number>>;

/**
 * `curve` prices every level with the venue fee curves (the default);
 * `flat` uses `feesCents` and is only chosen when a positive flat fee is
 * configured explicitly. A zero flat fee is never honoured: it was the
 * configuration the May 2026 runs carried, and it was wrong.
 */
export type CrossVenueFeeModel = "curve" | "flat";

export type CrossVenueFeeCurve = {
  yes: { venue: CrossVenue; role: LegRole; category: string | null };
  no: { venue: CrossVenue; role: LegRole; category: string | null };
};

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
  role: LegRole;
  sizeUsd: number;
  feeUsd: number;
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
  feeModel: CrossVenueFeeModel;
  feeModelVersion: string;
  roleMode: ExecutionRoleMode;
  capitalUsd: number;
  grossEdgeBps: number;
  executableNetEdgeBps: number;
  daysToResolution: number | null;
  annualizedPct: number | null;
  ruleMatch: "unverified" | "reviewed";
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

export type CrossVenueEconomicsOptions = {
  feesCents?: CrossVenueFeeConfig;
  minNetCents?: number;
  roleMode?: ExecutionRoleMode;
  nowMs?: number;
};

export type ScanCrossVenuePairsOptions = CrossVenueEconomicsOptions & {
  fetchKalshiBook?: (ticker: string) => Promise<KalshiOrderBook>;
  fetchPolymarketBook?: (tokenId: string) => Promise<OrderBook>;
  orderbookCache?: LiveOrderBookCache;
  orderbookCacheMaxAgeMs?: number;
  warn?: (message: string) => void;
};

export type CrossVenueRejectedPair = {
  pairId: string;
  reason: string;
  detail?: string;
};

/** A pair that was read and priced, and had no edge at the executable size. */
export type CrossVenueNoEdgePair = {
  pairId: string;
  reason: RejectionReason;
  grossCents: number;
  netCents: number;
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
  rejected: CrossVenueRejectedPair[];
  noEdge: CrossVenueNoEdgePair[];
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
  const noEdge: CrossVenueScanResult["noEdge"] = [];
  const orderbookReads = emptyCrossVenueOrderbookReadMetrics();
  const readMemo: CrossVenueOrderbookReadMemo = {
    kalshi: new Map(),
    polymarket: new Map(),
  };

  for (const pair of pairs) {
    try {
      validatePair(pair);

      const questionMismatch = classifyPairQuestionMismatch(pair);

      if (questionMismatch) {
        rejected.push({
          pairId: pair.id,
          reason: questionMismatch.reason,
          detail: questionMismatch.detail,
        });
        warn(
          `Skipping cross-venue pair "${pair.id}": ${questionMismatch.reason} (${questionMismatch.detail})`,
        );
        continue;
      }

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

      const evaluation = evaluateCrossVenueArbs(pair, books, {
        feesCents: options.feesCents,
        minNetCents: options.minNetCents,
        roleMode: options.roleMode,
        nowMs: options.nowMs,
      });

      opportunities.push(...evaluation.opportunities);
      if (evaluation.opportunities.length === 0 && evaluation.noEdge) {
        noEdge.push(evaluation.noEdge);
      }
      priceSpreads.push(...calculateCrossVenuePriceSpreads(pair, books));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const reason: RejectionReason = /required/u.test(detail)
        ? "pair_config_invalid"
        : "orderbook_error";

      rejected.push({ pairId: pair.id, reason, detail });
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
    noEdge,
    orderbookReads: finalizeCrossVenueOrderbookReadMetrics(orderbookReads),
  };
}

function classifyPairQuestionMismatch(
  pair: CrossVenuePair,
): { reason: RejectionReason; detail: string } | null {
  const kalshiTitle = pair.kalshi.title?.trim();
  const polymarketQuestion = pair.polymarket.question?.trim();

  if (!kalshiTitle || !polymarketQuestion) {
    return null;
  }

  return classifyQuestionMismatch(polymarketQuestion, kalshiTitle);
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

export function resolveCrossVenueFeeModel(
  feesCents: CrossVenueFeeConfig | undefined,
): CrossVenueFeeModel {
  const flat = Object.values(feesCents ?? {}).some(
    (fee) => typeof fee === "number" && Number.isFinite(fee) && fee > 0,
  );

  return flat ? "flat" : "curve";
}

export function calculateCrossVenueArbs(
  pair: CrossVenuePair,
  books: CrossVenueBook[],
  options: CrossVenueEconomicsOptions = {},
): CrossVenueArbOpportunity[] {
  return evaluateCrossVenueArbs(pair, books, options).opportunities;
}

/**
 * Price every YES/NO venue combination of one pair against both ask ladders.
 *
 * Returns the opportunities that clear the fee curves and the minimum net edge
 * at the executable size, plus - when none does - the single most flattering
 * reason why not, so a scanned pair without an edge is journaled as rejected
 * and not silently dropped.
 */
export function evaluateCrossVenueArbs(
  pair: CrossVenuePair,
  books: CrossVenueBook[],
  options: CrossVenueEconomicsOptions = {},
): { opportunities: CrossVenueArbOpportunity[]; noEdge: CrossVenueNoEdgePair | null } {
  const minNetCents = options.minNetCents ?? DEFAULT_CROSS_VENUE_MIN_NET_CENTS;
  const roleMode = options.roleMode ?? "taker";
  const nowMs = options.nowMs ?? Date.now();
  const feeModel = resolveCrossVenueFeeModel(options.feesCents);
  const category = pair.category ?? null;
  const opportunities: CrossVenueArbOpportunity[] = [];
  let noEdge: CrossVenueNoEdgePair | null = null;

  const noteNoEdge = (reason: RejectionReason, grossCents: number, netCents: number): void => {
    if (!noEdge || netCents > noEdge.netCents) {
      noEdge = { pairId: pair.id, reason, grossCents, netCents };
    }
  };

  for (const yesBook of books) {
    for (const noBook of books) {
      if (yesBook.venue === noBook.venue) {
        continue;
      }

      const yesBestAsk = yesBook.bestYesAsk;
      const noBestAsk = noBook.bestNoAsk;

      if (yesBestAsk === null || noBestAsk === null) {
        noteNoEdge("partial_basket_invalid", 0, 0);
        continue;
      }

      const roles = assignLegRoles(
        [
          { venue: yesBook.venue, price: yesBestAsk, category },
          { venue: noBook.venue, price: noBestAsk, category },
        ],
        feeModel === "curve" ? roleMode : "taker",
      );
      const yesRole = roles[0]?.role ?? "taker";
      const noRole = roles[1]?.role ?? "taker";
      const feeCurve: CrossVenueFeeCurve = {
        yes: { venue: yesBook.venue, role: yesRole, category },
        no: { venue: noBook.venue, role: noRole, category },
      };
      const flatFeeCents =
        feeForVenue(yesBook.venue, options.feesCents) +
        feeForVenue(noBook.venue, options.feesCents);
      const feeCents =
        feeModel === "flat"
          ? flatFeeCents
          : roundCents(
              (legFeeRate(feeCurve.yes) * yesBestAsk * (1 - yesBestAsk) +
                legFeeRate(feeCurve.no) * noBestAsk * (1 - noBestAsk)) *
                100,
            );
      const totalTopOfBookCost = roundPrice(yesBestAsk + noBestAsk);
      const grossCents = roundCents((1 - totalTopOfBookCost) * 100);
      const netCents = roundCents(grossCents - feeCents);

      if (netCents < minNetCents) {
        noteNoEdge(
          grossCents <= 0
            ? "non_positive_executable_edge"
            : netCents <= 0
              ? "non_positive_net_edge_after_fees"
              : "below_min_net_edge",
          grossCents,
          netCents,
        );
        continue;
      }

      const ladder = walkCrossVenueAskLadders(
        yesBook.yesAskLevels,
        noBook.noAskLevels,
        feeModel === "flat" ? flatFeeCents : feeCurve,
      );

      if (ladder.executableSize <= 0 || ladder.maxProfitDollars <= 0) {
        noteNoEdge("non_positive_net_edge_after_fees", grossCents, netCents);
        continue;
      }

      const economics: BasketEconomics = computeBasketEconomics({
        legs: [
          {
            venue: yesBook.venue,
            side: "YES",
            averageFillPrice: ladder.yesAverageFillPrice,
            shares: ladder.executableSize,
            category,
            role: yesRole,
          },
          {
            venue: noBook.venue,
            side: "NO",
            averageFillPrice: ladder.noAverageFillPrice,
            shares: ladder.executableSize,
            category,
            role: noRole,
          },
        ],
        payoutPerBasketShare: 1,
        roleMode,
        expectedResolutionAt: pair.expectedResolutionAt ?? null,
        nowMs,
      });
      const yesEconomics = economics.legs[0];
      const noEconomics = economics.legs[1];
      const maxProfitDollars =
        feeModel === "flat" ? ladder.maxProfitDollars : economics.netProfitUsd;

      if (feeModel === "curve" && maxProfitDollars <= 0) {
        noteNoEdge("non_positive_net_edge_after_fees", grossCents, netCents);
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
        maxProfitDollars: roundUsd(maxProfitDollars),
        ...(pair.category ? { category: pair.category } : {}),
        ...(pair.expectedResolutionAt
          ? { expectedResolutionAt: pair.expectedResolutionAt }
          : {}),
        ...(pair.liquidityDollars !== undefined
          ? { liquidityDollars: pair.liquidityDollars }
          : {}),
        ...(pair.volume24h !== undefined ? { volume24h: pair.volume24h } : {}),
        reason: "cross_venue_yes_no_below_one",
        feeModel,
        feeModelVersion: feeModel === "curve" ? FEE_MODEL_VERSION : "flat",
        roleMode: feeModel === "curve" ? roleMode : "taker",
        capitalUsd: economics.capitalUsd,
        grossEdgeBps: economics.grossEdgeBps,
        executableNetEdgeBps:
          feeModel === "flat"
            ? roundBps((maxProfitDollars / Math.max(economics.capitalUsd, 1e-9)) * 10_000)
            : economics.executableNetEdgeBps,
        daysToResolution: economics.daysToResolution,
        annualizedPct:
          feeModel === "flat"
            ? annualizeFlat(maxProfitDollars, economics.capitalUsd, economics.daysToResolution)
            : economics.annualizedPct,
        ruleMatch: pair.review?.verdict === "equivalent" ? "reviewed" : "unverified",
        yesLeg: {
          venue: yesBook.venue,
          side: "YES",
          identifier: yesBook.identifier,
          bestAsk: yesBestAsk,
          averageFillPrice: ladder.yesAverageFillPrice,
          role: yesRole,
          sizeUsd: yesEconomics?.sizeUsd ?? 0,
          feeUsd: feeModel === "flat" ? roundUsd((feeForVenue(yesBook.venue, options.feesCents) / 100) * ladder.executableSize) : (yesEconomics?.feeUsd ?? 0),
        },
        noLeg: {
          venue: noBook.venue,
          side: "NO",
          identifier: noBook.identifier,
          bestAsk: noBestAsk,
          averageFillPrice: ladder.noAverageFillPrice,
          role: noRole,
          sizeUsd: noEconomics?.sizeUsd ?? 0,
          feeUsd: feeModel === "flat" ? roundUsd((feeForVenue(noBook.venue, options.feesCents) / 100) * ladder.executableSize) : (noEconomics?.feeUsd ?? 0),
        },
      });
    }
  }

  return { opportunities, noEdge: opportunities.length === 0 ? noEdge : null };
}

function annualizeFlat(
  netProfitUsd: number,
  capitalUsd: number,
  days: number | null,
): number | null {
  if (days === null || capitalUsd <= 0) {
    return null;
  }

  return Math.round(((netProfitUsd / capitalUsd) * (365 / Math.max(1, days)) * 100 + Number.EPSILON) * 100) / 100;
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
  fee: number | CrossVenueFeeCurve,
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

    const feeCents =
      typeof fee === "number"
        ? fee
        : roundCents(
            (legFeeRate(fee.yes) * yes.price * (1 - yes.price) +
              legFeeRate(fee.no) * no.price * (1 - no.price)) *
              100,
          );
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
