import axios from "axios";
import { pathToFileURL } from "node:url";
import { closeDb, getDb, initDb } from "./db.js";
import { type PaperTrade, type PaperTradeSide } from "./tradeJournal.js";
import { retryWithBackoff, withTimeout } from "../utils/reliability.js";

const GAMMA_MARKETS_URL = "https://gamma-api.polymarket.com/markets";
const GAMMA_TIMEOUT_MS = 10_000;

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
      winningSide: PaperTradeSide;
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

  const response = await retryWithBackoff(
    () =>
      withTimeout(
        axios.get<unknown>(GAMMA_MARKETS_URL, {
          params: request.slug
            ? { slug: request.slug }
            : { condition_ids: request.conditionId },
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
      reason: "market_not_found"
    };
  }

  return inferResolutionFromMarket(market, request);
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

  if (!slug) {
    return {
      slug,
      conditionId,
      resolutionStatus: resolution.status,
      resolvedCount: 0,
      unresolvedCount: countUnresolvedPaperTrades(),
      flaggedCount: 0,
      reason: "paper_trade_slug_required"
    };
  }

  const trades = listUnresolvedPaperTradesForSlug(slug);

  if (resolution.status === "unresolved") {
    return {
      slug,
      conditionId,
      resolutionStatus: resolution.status,
      resolvedCount: 0,
      unresolvedCount: trades.length,
      flaggedCount: 0,
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
      reason: resolution.reason
    };
  }

  let resolvedCount = 0;
  let flaggedCount = 0;
  const resolvedAt = resolution.resolvedAt ?? options.now?.() ?? Date.now();

  for (const trade of trades) {
    const calculation = calculatePaperPnlOnlyIfResolutionKnown(
      trade,
      resolution
    );

    if (!calculation.canCalculate) {
      flagTrade(trade.id, calculation.reason);
      flaggedCount += 1;
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
    unresolvedCount: trades.length - resolvedCount,
    flaggedCount,
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

  const exitPrice = trade.side === resolution.winningSide ? 1 : 0;
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
      ORDER BY MIN(timestamp) ASC
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

function flagTrade(id: string, reason: string): void {
  getDb()
    .prepare(
      `
      UPDATE paper_trades
      SET inflation_flagged = 1,
          resolution_reason = @reason
      WHERE id = @id AND resolved = 0
      `
    )
    .run({ id, reason });
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

  const priceWinner = winningSideFromFinalPrices(
    arrayField(market.outcomes),
    arrayField(market.outcomePrices)
  );

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

function winningSideFromFinalPrices(
  outcomes: unknown[],
  prices: unknown[]
): PaperTradeSide | undefined {
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

  if (yesPrice >= 0.999 && noPrice <= 0.001) {
    return "YES";
  }

  if (noPrice >= 0.999 && yesPrice <= 0.001) {
    return "NO";
  }

  return undefined;
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
      const timestamp = Date.parse(candidate);

      if (Number.isFinite(timestamp)) {
        return timestamp;
      }
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
