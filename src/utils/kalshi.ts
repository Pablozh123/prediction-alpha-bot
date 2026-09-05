import axios from "axios";
import { parseTimestampMs } from "./marketTime.js";
import { retryWithBackoff, withTimeout } from "./reliability.js";
import type { OrderBookLevel } from "./orderbook.js";

const KALSHI_BASE_URL = "https://external-api.kalshi.com/trade-api/v2";
const KALSHI_TIMEOUT_MS = 10_000;
const DEFAULT_KALSHI_MARKET_LIMIT = 200;

/**
 * A paper trade on a Kalshi leg is journaled under this slug prefix, so the
 * resolution loop knows which venue to ask (decision E5 of
 * docs/ARB_TAXONOMY.md: cross-venue pairs paper-fire since 2026-09-05).
 */
export const KALSHI_PAPER_SLUG_PREFIX = "kalshi:";

export function kalshiPaperSlug(ticker: string): string {
  return `${KALSHI_PAPER_SLUG_PREFIX}${ticker.trim()}`;
}

export function kalshiTickerFromPaperSlug(slug: string): string | undefined {
  const value = slug.trim();

  if (!value.startsWith(KALSHI_PAPER_SLUG_PREFIX)) {
    return undefined;
  }

  const ticker = value.slice(KALSHI_PAPER_SLUG_PREFIX.length).trim();

  return ticker || undefined;
}

/** What Kalshi says about one market's settlement, read without credentials. */
export type KalshiMarketSettlement = {
  ticker: string;
  /** Kalshi's status word, lower case: open, closed, settled, finalized, ... */
  status: string;
  /** The side that paid, when the market has a binary result. */
  result: "YES" | "NO" | null;
  closeTime: number | null;
  expirationTime: number | null;
};

export type KalshiOrderBook = {
  ticker: string;
  yesBids: OrderBookLevel[];
  noBids: OrderBookLevel[];
  yesAsks: OrderBookLevel[];
  noAsks: OrderBookLevel[];
};

export type KalshiMarket = {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string;
  yesSubTitle: string;
  noSubTitle: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  expectedExpirationTime: number | null;
  closeTime: number | null;
  yesAsk: number | null;
  noAsk: number | null;
  liquidityDollars: number | null;
  volume24h: number | null;
};

type RawKalshiOrderBookLevel = [unknown, unknown];

type RawKalshiMarket = Record<string, unknown>;

type RawKalshiMarketsResponse = {
  markets?: RawKalshiMarket[];
  cursor?: string;
};

type RawKalshiOrderBook = {
  orderbook?: {
    yes?: RawKalshiOrderBookLevel[];
    no?: RawKalshiOrderBookLevel[];
  };
  orderbook_fp?: {
    yes_dollars?: RawKalshiOrderBookLevel[];
    no_dollars?: RawKalshiOrderBookLevel[];
  };
};

/**
 * One market by ticker. Null when Kalshi answers 404: the ticker is not a
 * market there, and the caller records that instead of failing the batch.
 */
export async function fetchKalshiMarketSettlement(
  ticker: string,
): Promise<KalshiMarketSettlement | null> {
  const cleaned = ticker.trim();

  if (!cleaned) {
    throw new Error("Cannot fetch Kalshi market: ticker is required.");
  }

  try {
    const response = await retryWithBackoff(
      () =>
        withTimeout(
          axios.get<{ market?: RawKalshiMarket }>(
            `${KALSHI_BASE_URL}/markets/${encodeURIComponent(cleaned)}`,
            { timeout: KALSHI_TIMEOUT_MS },
          ),
          KALSHI_TIMEOUT_MS + 1_000,
          "Kalshi market request timed out.",
        ),
      { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 },
    );
    const raw = response?.data?.market;

    return raw ? normalizeKalshiMarketSettlement(raw) : null;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;

    if (status === 404) {
      return null;
    }

    throw error;
  }
}

export function normalizeKalshiMarketSettlement(
  raw: RawKalshiMarket,
): KalshiMarketSettlement {
  const result = String(raw.result ?? "").trim().toLowerCase();

  return {
    ticker: String(raw.ticker ?? "").trim(),
    status: String(raw.status ?? "").trim().toLowerCase(),
    result: result === "yes" ? "YES" : result === "no" ? "NO" : null,
    closeTime: parseTimestampMs(raw.close_time ?? raw.closeTime),
    expirationTime: parseTimestampMs(
      raw.expiration_time ?? raw.expirationTime ?? raw.settlement_ts ?? raw.settlementTs,
    ),
  };
}

export async function fetchKalshiOrderBook(
  ticker: string,
  depth = 100,
): Promise<KalshiOrderBook> {
  if (!ticker.trim()) {
    throw new Error("Cannot fetch Kalshi orderbook: ticker is required.");
  }

  try {
    const response = await retryWithBackoff(
      () =>
        withTimeout(
          axios.get<RawKalshiOrderBook>(
            `${KALSHI_BASE_URL}/markets/${encodeURIComponent(ticker)}/orderbook`,
            {
              params: { depth },
              timeout: KALSHI_TIMEOUT_MS,
            },
          ),
          KALSHI_TIMEOUT_MS + 1_000,
          `Kalshi orderbook request for "${ticker}" timed out.`,
        ),
      { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 },
    );

    return normalizeKalshiOrderBook(response.data, ticker);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch Kalshi orderbook for "${ticker}": ${detail}`,
      { cause: error },
    );
  }
}

export async function fetchKalshiMarkets(
  options: {
    limit?: number;
    maxPages?: number;
    seriesTickers?: string[];
    eventTickers?: string[];
    status?: "open";
  } = {},
): Promise<KalshiMarket[]> {
  const limit = options.limit ?? DEFAULT_KALSHI_MARKET_LIMIT;
  const maxPages = options.maxPages ?? 1;
  const status = options.status ?? "open";
  const markets: KalshiMarket[] = [];
  const scopedTickers = [
    ...(options.seriesTickers ?? []).map((ticker) => ({
      key: "series_ticker",
      value: ticker,
    })),
    ...(options.eventTickers ?? []).map((ticker) => ({
      key: "event_ticker",
      value: ticker,
    })),
  ].filter((item) => item.value.trim().length > 0);

  if (scopedTickers.length > 0) {
    for (const ticker of scopedTickers) {
      markets.push(
        ...(await fetchKalshiMarketsPageSet({
          filter: { [ticker.key]: ticker.value },
          limit,
          maxPages,
          status,
        })),
      );
    }

    return uniqueKalshiMarkets(markets);
  }

  return fetchKalshiMarketsPageSet({ limit, maxPages, status });
}

async function fetchKalshiMarketsPageSet(options: {
  filter?: Record<string, string>;
  limit: number;
  maxPages: number;
  status: "open";
}): Promise<KalshiMarket[]> {
  const markets: KalshiMarket[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < options.maxPages; page += 1) {
    try {
      const response = await retryWithBackoff(
        () =>
          withTimeout(
            axios.get<RawKalshiMarketsResponse>(`${KALSHI_BASE_URL}/markets`, {
              params: {
                limit: options.limit,
                status: options.status,
                ...(options.filter ?? {}),
                ...(cursor ? { cursor } : {}),
              },
              timeout: KALSHI_TIMEOUT_MS,
            }),
            KALSHI_TIMEOUT_MS + 1_000,
            "Kalshi markets request timed out.",
          ),
        { attempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 },
      );

      markets.push(...(response.data.markets ?? []).map(normalizeKalshiMarket));

      cursor = optionalString(response.data.cursor) || undefined;
      if (!cursor) {
        break;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch Kalshi markets: ${detail}`, {
        cause: error,
      });
    }
  }

  return markets.filter((market) => market.ticker.length > 0);
}

function uniqueKalshiMarkets(markets: KalshiMarket[]): KalshiMarket[] {
  const seen = new Set<string>();
  const unique: KalshiMarket[] = [];

  for (const market of markets) {
    if (!market.ticker || seen.has(market.ticker)) {
      continue;
    }
    seen.add(market.ticker);
    unique.push(market);
  }

  return unique;
}

export function normalizeKalshiMarket(raw: RawKalshiMarket): KalshiMarket {
  return {
    ticker: optionalString(raw.ticker),
    eventTicker: optionalString(raw.event_ticker ?? raw.eventTicker),
    title: optionalString(raw.title),
    subtitle: optionalString(raw.subtitle),
    yesSubTitle: optionalString(
      raw.yes_sub_title ?? raw.yesSubTitle ?? raw.yes_subtitle,
    ),
    noSubTitle: optionalString(
      raw.no_sub_title ?? raw.noSubTitle ?? raw.no_subtitle,
    ),
    ...(optionalString(raw.rules_primary ?? raw.rulesPrimary)
      ? { rulesPrimary: optionalString(raw.rules_primary ?? raw.rulesPrimary) }
      : {}),
    ...(optionalString(raw.rules_secondary ?? raw.rulesSecondary)
      ? { rulesSecondary: optionalString(raw.rules_secondary ?? raw.rulesSecondary) }
      : {}),
    expectedExpirationTime: parseTimestampMs(
      raw.expected_expiration_time ?? raw.expectedExpirationTime,
    ),
    closeTime: parseTimestampMs(raw.close_time ?? raw.closeTime),
    yesAsk: normalizeNullablePrice(raw.yes_ask_dollars ?? raw.yes_ask),
    noAsk: normalizeNullablePrice(raw.no_ask_dollars ?? raw.no_ask),
    liquidityDollars: normalizeNullableNumber(
      raw.liquidity_dollars ?? raw.liquidity,
    ),
    volume24h: normalizeNullableNumber(raw.volume_24h ?? raw.volume24h),
  };
}

export function normalizeKalshiOrderBook(
  raw: RawKalshiOrderBook,
  ticker: string,
): KalshiOrderBook {
  const yesBids = normalizeBidLevels(
    raw.orderbook_fp?.yes_dollars ?? raw.orderbook?.yes,
  );
  const noBids = normalizeBidLevels(
    raw.orderbook_fp?.no_dollars ?? raw.orderbook?.no,
  );

  return {
    ticker,
    yesBids,
    noBids,
    yesAsks: deriveComplementaryAsks(noBids),
    noAsks: deriveComplementaryAsks(yesBids),
  };
}

function normalizeBidLevels(
  levels: RawKalshiOrderBookLevel[] | undefined,
): OrderBookLevel[] {
  if (!Array.isArray(levels)) {
    return [];
  }

  return levels
    .flatMap((level): OrderBookLevel[] => {
      const price = normalizeKalshiPrice(level[0]);
      const size = Number(level[1]);

      if (!isPlausiblePrice(price) || !Number.isFinite(size) || size <= 0) {
        return [];
      }

      return [{ price: roundPrice(price), size }];
    })
    .sort((left, right) => right.price - left.price);
}

function deriveComplementaryAsks(bids: OrderBookLevel[]): OrderBookLevel[] {
  return bids
    .map((bid) => ({
      price: roundPrice(1 - bid.price),
      size: bid.size,
    }))
    .filter((level) => isPlausiblePrice(level.price) && level.size > 0)
    .sort((left, right) => left.price - right.price);
}

function normalizeKalshiPrice(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return parsed > 1 ? parsed / 100 : parsed;
}

function normalizeNullablePrice(value: unknown): number | null {
  const parsed = normalizeKalshiPrice(value);

  return isPlausiblePrice(parsed) ? roundPrice(parsed) : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
