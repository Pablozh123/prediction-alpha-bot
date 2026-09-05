import axios from "axios";
import { pathToFileURL } from "node:url";
import { closeDb, getDb, initDb } from "./db.js";
import { type PaperTrade, type PaperTradeSide } from "./tradeJournal.js";
import {
  fetchKalshiMarketSettlement,
  kalshiTickerFromPaperSlug,
} from "../utils/kalshi.js";
import { retryWithBackoff, withTimeout } from "../utils/reliability.js";

const GAMMA_MARKETS_URL = "https://gamma-api.polymarket.com/markets";
const GAMMA_TIMEOUT_MS = 10_000;
// Gamma lists a settled market only when asked for closed markets: the plain
// slug query answers with an empty list. This lookup asked without the flag
// from May to September 2026 and never saw a settlement; the terminal's own
// resolution pass found it (docs/research/arb_paper_resolution_2026-09-05.md
// in that repo). A market not found among the closed ones is, for this
// lookup, still open.
const GAMMA_CLOSED_ONLY = { closed: true } as const;
// A split settlement pays half a dollar a share to both sides.
const SPLIT_PRICE = 0.5;
const SPLIT_TOLERANCE = 0.001;

export type ResolutionLookup =
  | string
  | {
      slug?: string;
      conditionId?: string;
    };

export type MarketResolution =
  | {
      status: "unresolved";
      slug?: string;
      conditionId?: string;
      reason: string;
    }
  | {
      status: "ambiguous";
      slug?: string;
      conditionId?: string;
      reason: string;
    }
  | {
      status: "resolved";
      /** The side that pays one dollar a share; null on a split settlement. */
      winningSide: PaperTradeSide | null;
      /** Settlement price per side; derived from winningSide when absent. */
      settlement?: Record<PaperTradeSide, number>;
      slug?: string;
      conditionId?: string;
      resolvedAt?: number;
      reason: string;
    };

export type PaperPnlCalculation =
  | {
      canCalculate: true;
      exitPrice: number;
      pnl: number;
    }
  | {
      canCalculate: false;
      reason: string;
    };

export type ResolvePaperTradesResult = {
  slug?: string;
  conditionId?: string;
  resolutionStatus: MarketResolution["status"];
  resolvedCount: number;
  unresolvedCount: number;
  flaggedCount: number;
  /** Trades on a settled market that got a reason instead of a figure. */
  closedWithoutFigureCount: number;
  reason: string;
};

export type ResolvePaperTradesOptions = {
  fetchResolution?: (lookup: ResolutionLookup) => Promise<MarketResolution>;
  now?: () => number;
};

export type BatchResolvePaperTradesOptions = ResolvePaperTradesOptions & {
  limit?: number;
};

export type BatchResolvePaperTradesResult = {
  checkedSlugs: number;
  skippedNoSlugCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  flaggedCount: number;
  closedWithoutFigureCount: number;
  results: ResolvePaperTradesResult[];
};

type PaperTradeRow = {
  id: string;
  strategy: string;
  slug: string | null;
  question: string | null;
  token_id: string | null;
  opportunity_id: string | null;
  side: PaperTradeSide;
  size_usd: number;
  size_shares: number | null;
  entry_price: number;
  exit_price: number | null;
  resolved: number;
  pnl: number | null;
  inflation_flagged: number;
  resolution_reason: string | null;
  arb_class: string | null;
  link_status: PaperTrade["linkStatus"];
  timestamp: number;
  resolved_at: number | null;
};

type GammaMarketCandidate = Record<string, unknown>;

type SlugRow = {
  slug: string | null;
};

export async function fetchMarketResolution(
  lookup: ResolutionLookup
): Promise<MarketResolution> {
  const request = normalizeLookup(lookup);

  if (!request.slug && !request.conditionId) {
    return {
      status: "unresolved",
      reason: "missing_market_lookup"
    };
  }

  // A Kalshi leg (decision E5) is journaled under kalshi:<ticker> and is
  // settled by Kalshi's own market result, not by Gamma.
  const kalshiTicker = request.slug ? kalshiTickerFromPaperSlug(request.slug) : undefined;

  if (kalshiTicker && request.slug) {
    return resolveKalshiMarket(kalshiTicker, request.slug);
  }

  const response = await retryWithBackoff(
    () =>
      withTimeout(
        axios.get<unknown>(GAMMA_MARKETS_URL, {
          params: request.slug
            ? { slug: request.slug, ...GAMMA_CLOSED_ONLY }
            : { condition_ids: request.conditionId, ...GAMMA_CLOSED_ONLY },
          timeout: GAMMA_TIMEOUT_MS
        }),
        GAMMA_TIMEOUT_MS + 1_000,
        "Gamma market resolution request timed out."
      ),
    { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 }
  );
  const market = selectMarketCandidate(response.data, request);

  if (!market) {
    return {
      status: "unresolved",
      slug: request.slug,
      conditionId: request.conditionId,
      reason: "not_found_among_closed_markets"
    };
  }

  return inferResolutionFromMarket(market, request);
}

const KALSHI_SETTLED_STATUSES = new Set(["settled", "finalized", "determined"]);

async function resolveKalshiMarket(
  ticker: string,
  slug: string
): Promise<MarketResolution> {
  const market = await fetchKalshiMarketSettlement(ticker);

  if (!market) {
    return { status: "unresolved", slug, reason: "kalshi_market_not_found" };
  }

  // The trading close is the moment after which no fill is a fill; the
  // result may be determined days later.
  const resolvedAt = market.closeTime ?? market.expirationTime ?? undefined;

  if (market.result) {
    return {
      status: "resolved",
      winningSide: market.result,
      slug,
      ...(resolvedAt !== undefined ? { resolvedAt } : {}),
      reason: "kalshi_result"
    };
  }

  if (KALSHI_SETTLED_STATUSES.has(market.status)) {
    return { status: "ambiguous", slug, reason: "kalshi_settled_without_binary_result" };
  }

  return { status: "unresolved", slug, reason: "kalshi_market_not_settled" };
}

export async function resolvePaperTradesForMarket(
  lookup: ResolutionLookup,
  options: ResolvePaperTradesOptions = {}
): Promise<ResolvePaperTradesResult> {
  const request = normalizeLookup(lookup);
  const fetchResolution = options.fetchResolution ?? fetchMarketResolution;
  const resolution = await fetchResolution(lookup);
  const slug = request.slug ?? resolution.slug;
  const conditionId = request.conditionId ?? resolution.conditionId;
  const checkedAt = options.now?.() ?? Date.now();

  if (!slug) {
    return {
      slug,
      conditionId,
      resolutionStatus: resolution.status,
      resolvedCount: 0,
      unresolvedCount: countUnresolvedPaperTrades(),
      flaggedCount: 0,
      closedWithoutFigureCount: 0,
      reason: "paper_trade_slug_required"
    };
  }

  const trades = listUnresolvedPaperTradesForSlug(slug);
  // Every lookup stamps the slug, resolved or not, so the batch rotates
  // through the journal instead of re-asking the oldest slugs every time.
  markSlugChecked(slug, checkedAt);

  if (resolution.status === "unresolved") {
    return {
      slug,
      conditionId,
      resolutionStatus: resolution.status,
      resolvedCount: 0,
      unresolvedCount: trades.length,
      flaggedCount: 0,
      closedWithoutFigureCount: 0,
      reason: resolution.reason
    };
  }

  if (resolution.status === "ambiguous") {
    const flaggedCount = flagAmbiguousTrades(slug, resolution.reason);

    return {
      slug,
      conditionId,
      resolutionStatus: resolution.status,
      resolvedCount: 0,
      unresolvedCount: trades.length,
      flaggedCount,
      closedWithoutFigureCount: 0,
      reason: resolution.reason
    };
  }

  let resolvedCount = 0;
  let closedWithoutFigureCount = 0;
  const resolvedAt = resolution.resolvedAt ?? checkedAt;

  for (const trade of trades) {
    // A fill stamped after the market's close was never a fill: the scanner
    // was pricing a settled market. 98 of the 167 rows from May 2026 are of
    // this kind. The row closes with the reason and no figure, leaves the
    // queue, and never enters a PnL sum.
    if (
      resolution.resolvedAt !== undefined &&
      trade.timestamp > resolution.resolvedAt
    ) {
      closeTradeWithoutFigure(trade.id, "filled_after_close", resolvedAt);
      closedWithoutFigureCount += 1;
      continue;
    }

    const calculation = calculatePaperPnlOnlyIfResolutionKnown(
      trade,
      resolution
    );

    if (!calculation.canCalculate) {
      closeTradeWithoutFigure(trade.id, calculation.reason, resolvedAt);
      closedWithoutFigureCount += 1;
      continue;
    }

    getDb()
      .prepare(
        `
        UPDATE paper_trades
        SET
          exit_price = @exitPrice,
          resolved = 1,
          pnl = @pnl,
          resolved_at = @resolvedAt,
          resolution_reason = @reason
        WHERE id = @id AND resolved = 0
        `
      )
      .run({
        id: trade.id,
        exitPrice: calculation.exitPrice,
        pnl: calculation.pnl,
        resolvedAt,
        reason: resolution.reason
      });
    resolvedCount += 1;
  }

  return {
    slug,
    conditionId,
    resolutionStatus: resolution.status,
    resolvedCount,
    unresolvedCount: trades.length - resolvedCount - closedWithoutFigureCount,
    flaggedCount: closedWithoutFigureCount,
    closedWithoutFigureCount,
    reason: resolution.reason
  };
}

export async function resolveOpenPaperTradesBatch(
  options: BatchResolvePaperTradesOptions = {}
): Promise<BatchResolvePaperTradesResult> {
  const limit = options.limit ?? 100;
  const slugs = listUnresolvedPaperTradeSlugs(limit);
  const skippedNoSlugCount = countUnresolvedPaperTradesWithoutSlug();
  const results: ResolvePaperTradesResult[] = [];

  for (const slug of slugs) {
    results.push(
      await resolvePaperTradesForMarket(
        { slug },
        {
          fetchResolution: options.fetchResolution,
          now: options.now
        }
      )
    );
  }

  return {
    checkedSlugs: results.length,
    skippedNoSlugCount,
    resolvedCount: results.reduce((sum, row) => sum + row.resolvedCount, 0),
    unresolvedCount:
      skippedNoSlugCount +
      results.reduce((sum, row) => sum + row.unresolvedCount, 0),
    flaggedCount: results.reduce((sum, row) => sum + row.flaggedCount, 0),
    closedWithoutFigureCount: results.reduce(
      (sum, row) => sum + row.closedWithoutFigureCount,
      0
    ),
    results
  };
}

export function calculatePaperPnlOnlyIfResolutionKnown(
  trade: Pick<PaperTrade, "side" | "sizeUsd" | "entryPrice"> & {
    sizeShares?: number | null;
  },
  resolution: MarketResolution
): PaperPnlCalculation {
  if (resolution.status !== "resolved") {
    return {
      canCalculate: false,
      reason: resolution.reason
    };
  }

  if (!Number.isFinite(trade.sizeUsd) || trade.sizeUsd <= 0) {
    return {
      canCalculate: false,
      reason: "invalid_trade_size"
    };
  }

  if (
    !Number.isFinite(trade.entryPrice) ||
    trade.entryPrice <= 0 ||
    trade.entryPrice > 1
  ) {
    return {
      canCalculate: false,
      reason: "invalid_entry_price"
    };
  }

  if (
    trade.sizeShares !== undefined &&
    trade.sizeShares !== null &&
    (!Number.isFinite(trade.sizeShares) || trade.sizeShares <= 0)
  ) {
    return {
      canCalculate: false,
      reason: "invalid_trade_size"
    };
  }

  const exitPrice = settlementPriceForSide(resolution, trade.side);

  if (exitPrice === null) {
    return {
      canCalculate: false,
      reason: "no_settlement_price"
    };
  }

  const shares = trade.sizeShares ?? trade.sizeUsd / trade.entryPrice;
  const pnl = roundToCentsSafe(shares * exitPrice - trade.sizeUsd);

  return {
    canCalculate: true,
    exitPrice,
    pnl
  };
}

export function countUnresolvedPaperTrades(slug?: string): number {
  if (slug) {
    return (
      getDb()
        .prepare<{ count: number }>(
          "SELECT COUNT(*) AS count FROM paper_trades WHERE resolved = 0 AND slug = ?"
        )
        .get(slug)?.count ?? 0
    );
  }

  return (
    getDb()
      .prepare<{ count: number }>(
        "SELECT COUNT(*) AS count FROM paper_trades WHERE resolved = 0"
      )
      .get()?.count ?? 0
  );
}

/**
 * Least recently checked first. With 156 open slugs and a batch of 50, the
 * old order (oldest fill first) asked the same 50 slugs every half hour and
 * never reached the rest.
 */
function listUnresolvedPaperTradeSlugs(limit: number): string[] {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  return getDb()
    .prepare<SlugRow>(
      `
      SELECT slug
      FROM paper_trades
      WHERE resolved = 0 AND slug IS NOT NULL AND TRIM(slug) != ''
      GROUP BY slug
      ORDER BY MIN(COALESCE(resolution_checked_at, 0)) ASC, MIN(timestamp) ASC
      LIMIT ?
      `
    )
    .all(Math.floor(limit))
    .flatMap((row) => (row.slug ? [row.slug] : []));
}

function countUnresolvedPaperTradesWithoutSlug(): number {
  return (
    getDb()
      .prepare<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM paper_trades
        WHERE resolved = 0 AND (slug IS NULL OR TRIM(slug) = '')
        `
      )
      .get()?.count ?? 0
  );
}

function listUnresolvedPaperTradesForSlug(slug: string): PaperTrade[] {
  return getDb()
    .prepare<PaperTradeRow>(
      `
      SELECT
        id,
        strategy,
        slug,
        question,
        token_id,
        opportunity_id,
        side,
        size_usd,
        size_shares,
        entry_price,
        exit_price,
        resolved,
        pnl,
        inflation_flagged,
        resolution_reason,
        arb_class,
        link_status,
        timestamp,
        resolved_at
      FROM paper_trades
      WHERE resolved = 0 AND slug = ?
      ORDER BY timestamp ASC
      `
    )
    .all(slug)
    .map(mapPaperTradeRow);
}

function flagAmbiguousTrades(slug: string, reason: string): number {
  return getDb()
    .prepare(
      `
      UPDATE paper_trades
      SET inflation_flagged = 1,
          resolution_reason = @reason
      WHERE resolved = 0 AND slug = @slug
      `
    )
    .run({ slug, reason }).changes;
}

/**
 * The market has settled but the row gets no figure: the fill came after the
 * close, or the entry price cannot carry a share count. The row is closed with
 * the reason, flagged so no PnL sum picks it up, and leaves the queue.
 */
function closeTradeWithoutFigure(
  id: string,
  reason: string,
  resolvedAt: number
): void {
  getDb()
    .prepare(
      `
      UPDATE paper_trades
      SET resolved = 1,
          exit_price = NULL,
          pnl = NULL,
          inflation_flagged = 1,
          resolved_at = @resolvedAt,
          resolution_reason = @reason
      WHERE id = @id AND resolved = 0
      `
    )
    .run({ id, reason, resolvedAt });
}

function markSlugChecked(slug: string, checkedAt: number): void {
  getDb()
    .prepare(
      `
      UPDATE paper_trades
      SET resolution_checked_at = @checkedAt
      WHERE slug = @slug AND resolved = 0
      `
    )
    .run({ slug, checkedAt });
}

function normalizeLookup(lookup: ResolutionLookup): {
  slug?: string;
  conditionId?: string;
} {
  if (typeof lookup === "string") {
    const value = lookup.trim();

    return value.startsWith("0x")
      ? { conditionId: value }
      : { slug: value || undefined };
  }

  return {
    slug: lookup.slug?.trim() || undefined,
    conditionId: lookup.conditionId?.trim() || undefined
  };
}

function selectMarketCandidate(
  data: unknown,
  lookup: { slug?: string; conditionId?: string }
): GammaMarketCandidate | undefined {
  const candidates = extractMarketCandidates(data);

  if (lookup.slug) {
    const exactSlug = candidates.find((candidate) => candidate.slug === lookup.slug);

    if (exactSlug) {
      return exactSlug;
    }
  }

  if (lookup.conditionId) {
    const exactCondition = candidates.find(
      (candidate) =>
        candidate.conditionId === lookup.conditionId ||
        candidate.condition_id === lookup.conditionId
    );

    if (exactCondition) {
      return exactCondition;
    }
  }

  return candidates[0];
}

function extractMarketCandidates(data: unknown): GammaMarketCandidate[] {
  if (Array.isArray(data)) {
    return data.filter(isObjectRecord);
  }

  if (!isObjectRecord(data)) {
    return [];
  }

  if (Array.isArray(data.data)) {
    return data.data.filter(isObjectRecord);
  }

  if (Array.isArray(data.markets)) {
    return data.markets.filter(isObjectRecord);
  }

  return [data];
}

function inferResolutionFromMarket(
  market: GammaMarketCandidate,
  lookup: { slug?: string; conditionId?: string }
): MarketResolution {
  const slug = optionalString(market.slug) ?? lookup.slug;
  const conditionId =
    optionalString(market.conditionId) ??
    optionalString(market.condition_id) ??
    lookup.conditionId;
  const knownWinner =
    winningSideFromField(market.winningOutcome) ??
    winningSideFromField(market.winner) ??
    winningSideFromField(market.resolvedOutcome) ??
    winningSideFromField(market.winning_outcome);

  if (knownWinner) {
    return {
      status: "resolved",
      winningSide: knownWinner,
      slug,
      conditionId,
      resolvedAt: timestampFromMarket(market),
      reason: "known_winning_outcome"
    };
  }

  const closedOrResolved =
    booleanish(market.closed) === true || booleanish(market.resolved) === true;

  if (!closedOrResolved) {
    return {
      status: "unresolved",
      slug,
      conditionId,
      reason: "market_not_closed"
    };
  }

  const outcomes = arrayField(market.outcomes);
  const prices = arrayField(market.outcomePrices);
  const priceWinner = winningSideFromFinalPrices(outcomes, prices);

  if (priceWinner) {
    return {
      status: "resolved",
      winningSide: priceWinner,
      slug,
      conditionId,
      resolvedAt: timestampFromMarket(market),
      reason: "final_outcome_prices"
    };
  }

  if (isSplitSettlement(outcomes, prices) && umaResolved(market)) {
    return {
      status: "resolved",
      winningSide: null,
      settlement: { YES: SPLIT_PRICE, NO: SPLIT_PRICE },
      slug,
      conditionId,
      resolvedAt: timestampFromMarket(market),
      reason: "split_settlement"
    };
  }

  return {
    status: "ambiguous",
    slug,
    conditionId,
    reason: "closed_market_without_clear_winner"
  };
}

function winningSideFromField(value: unknown): PaperTradeSide | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "yes") {
    return "YES";
  }

  if (normalized === "no") {
    return "NO";
  }

  return undefined;
}

function finalPricesBySide(
  outcomes: unknown[],
  prices: unknown[]
): Record<PaperTradeSide, number> | undefined {
  if (outcomes.length < 2 || prices.length < 2) {
    return undefined;
  }

  const yesIndex = outcomes.findIndex(
    (outcome) => String(outcome).trim().toLowerCase() === "yes"
  );
  const noIndex = outcomes.findIndex(
    (outcome) => String(outcome).trim().toLowerCase() === "no"
  );

  if (yesIndex < 0 || noIndex < 0) {
    return undefined;
  }

  const yesPrice = Number(prices[yesIndex]);
  const noPrice = Number(prices[noIndex]);

  if (!Number.isFinite(yesPrice) || !Number.isFinite(noPrice)) {
    return undefined;
  }

  return { YES: yesPrice, NO: noPrice };
}

function winningSideFromFinalPrices(
  outcomes: unknown[],
  prices: unknown[]
): PaperTradeSide | undefined {
  const final = finalPricesBySide(outcomes, prices);

  if (!final) {
    return undefined;
  }

  if (final.YES >= 0.999 && final.NO <= 0.001) {
    return "YES";
  }

  if (final.NO >= 0.999 && final.YES <= 0.001) {
    return "NO";
  }

  return undefined;
}

/** Both sides at half a dollar: the market settled 0.5/0.5. */
function isSplitSettlement(outcomes: unknown[], prices: unknown[]): boolean {
  const final = finalPricesBySide(outcomes, prices);

  return (
    final !== undefined &&
    Math.abs(final.YES - SPLIT_PRICE) <= SPLIT_TOLERANCE &&
    Math.abs(final.NO - SPLIT_PRICE) <= SPLIT_TOLERANCE
  );
}

function umaResolved(market: GammaMarketCandidate): boolean {
  return (
    optionalString(market.umaResolutionStatus)?.toLowerCase() === "resolved"
  );
}

function settlementPriceForSide(
  resolution: Extract<MarketResolution, { status: "resolved" }>,
  side: PaperTradeSide
): number | null {
  const fromSettlement = resolution.settlement?.[side];

  if (typeof fromSettlement === "number" && Number.isFinite(fromSettlement)) {
    return fromSettlement;
  }

  if (resolution.winningSide === null) {
    return null;
  }

  return side === resolution.winningSide ? 1 : 0;
}

function arrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

function booleanish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function timestampFromMarket(market: GammaMarketCandidate): number | undefined {
  const candidates = [
    market.resolvedAt,
    market.resolved_at,
    market.closedTime,
    market.closed_time
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string") {
      const timestamp = parseGammaTimestamp(candidate);

      if (timestamp !== undefined) {
        return timestamp;
      }
    }
  }

  return undefined;
}

/**
 * Gamma writes closedTime as "2026-01-05 04:22:25+00": a space instead of the
 * T and an hour-only offset. Normalised to ISO 8601 before parsing, so the
 * offset is read as UTC and not guessed.
 */
function parseGammaTimestamp(value: string): number | undefined {
  const normalized = value
    .trim()
    .replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})$/,
      "$1T$2$3:00"
    );

  for (const candidate of [normalized, value]) {
    const parsed = Date.parse(candidate);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function mapPaperTradeRow(row: PaperTradeRow): PaperTrade {
  return {
    id: row.id,
    strategy: row.strategy,
    slug: row.slug,
    question: row.question,
    tokenId: row.token_id,
    opportunityId: row.opportunity_id,
    side: row.side,
    sizeUsd: row.size_usd,
    sizeShares: row.size_shares,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    resolved: row.resolved === 1,
    pnl: row.pnl,
    inflationFlagged: row.inflation_flagged === 1,
    resolutionReason: row.resolution_reason,
    arbClass: row.arb_class,
    linkStatus: row.link_status,
    timestamp: row.timestamp,
    resolvedAt: row.resolved_at
  };
}

function isObjectRecord(value: unknown): value is GammaMarketCandidate {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundToCentsSafe(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const isBatch = args.includes("--batch");
  const dbArg = args.find((arg) => arg.startsWith("--db="));
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit =
    limitArg === undefined ? undefined : Number(limitArg.slice("--limit=".length));
  const lookup = args.find((arg) => !arg.startsWith("--"));
  const dbPath = dbArg?.slice("--db=".length) ?? process.env.DATABASE_PATH;

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    console.error("paper resolution failed: --limit must be a positive number.");
    process.exitCode = 1;
  } else {
    if (dbPath) {
      initDb(dbPath);
    }

    try {
      if (isBatch) {
        const result = await resolveOpenPaperTradesBatch({ limit });
        console.log(JSON.stringify(result, null, 2));
      } else if (!lookup) {
        const unresolvedCount = countUnresolvedPaperTrades();

        console.log(
          `paper resolution skipped: provide slug or conditionId. unresolvedCount=${unresolvedCount}`
        );
      } else {
        const result = await resolvePaperTradesForMarket(lookup);
        console.log(JSON.stringify(result, null, 2));
      }
    } finally {
      closeDb();
    }
  }
}
