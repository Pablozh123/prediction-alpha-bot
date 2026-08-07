import { getDb } from "../execution/db.js";
import { recordOrderBookSnapshot } from "../execution/orderbookSnapshotJournal.js";
import {
  filterBlockedOrderBookTokens,
  recordOrderBookTokenBlock,
  type OrderBookTokenBlockReason,
} from "../execution/orderbookTokenBlocklist.js";
import {
  fetchActiveEvents,
  fetchNegRiskEvents,
  normalizeGammaMarket,
  type GammaRawEvent,
} from "../utils/gamma.js";
import { fetchOrderBook, type OrderBook } from "../utils/orderbook.js";
import { deriveExpectedResolutionAt } from "../utils/marketTime.js";

const DEFAULT_SNAPSHOT_TOKEN_LIMIT = 160;
const DEFAULT_GAMMA_EVENT_LIMIT = 400;
const DEFAULT_MAX_TOKENS_PER_MARKET = 16;
const ORDERBOOK_TOKEN_BLOCK_MS = 86_400_000;
const NEG_RISK_WATCH_SUM_YES = 1;
const WITHIN_MARKET_WATCH_TOTAL_COST = 1.02;

export type OrderBookSnapshotCycleLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type OrderBookSnapshotToken = {
  tokenId: string;
  marketSlug?: string | null;
  eventSlug?: string | null;
  marketId?: string | null;
  side?: "YES" | "NO" | null;
  strategySource?: string | null;
  expectedResolutionAt?: number | null;
};

export type OrderBookSnapshotCycleResult = {
  success: boolean;
  candidateTokens: number;
  snapshotsRecorded: number;
  errors: number;
  blockedFailures: number;
  blockedTokensSkipped: number;
};

export type RunOrderBookSnapshotCycleOptions = {
  fetchBook?: (tokenId: string) => Promise<OrderBook>;
  fetchEvents?: (limit: number) => Promise<GammaRawEvent[]>;
  fetchNegRiskEvents?: (limit: number) => Promise<GammaRawEvent[]>;
  gammaEventLimit?: number;
  logger?: OrderBookSnapshotCycleLogger;
  maxTokensPerMarket?: number;
  tokenLimit?: number;
  tokens?: OrderBookSnapshotToken[];
};

const defaultLogger: OrderBookSnapshotCycleLogger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
};

export async function runOrderBookSnapshotCycle(
  options: RunOrderBookSnapshotCycleOptions = {},
): Promise<OrderBookSnapshotCycleResult> {
  const logger = options.logger ?? defaultLogger;
  const tokenLimit = options.tokenLimit ?? DEFAULT_SNAPSHOT_TOKEN_LIMIT;
  const fetchBook = options.fetchBook ?? fetchOrderBook;
  const tokens =
    options.tokens ??
    (await collectSnapshotTokens({
      fetchEvents: options.fetchEvents ?? fetchActiveEvents,
      fetchNegRiskEvents: options.fetchNegRiskEvents ?? fetchNegRiskEvents,
      gammaEventLimit: options.gammaEventLimit ?? DEFAULT_GAMMA_EVENT_LIMIT,
      maxTokensPerMarket:
        options.maxTokensPerMarket ?? DEFAULT_MAX_TOKENS_PER_MARKET,
      tokenLimit: tokenLimit * 2,
    }));
  const filteredTokens = filterBlockedOrderBookTokens(tokens).available;
  const blockedTokensSkipped = tokens.length - filteredTokens.length;
  const selectedTokens = filteredTokens.slice(0, tokenLimit);
  let snapshotsRecorded = 0;
  let errors = 0;
  let blockedFailures = 0;

  for (const token of selectedTokens) {
    try {
      const orderbook = await fetchBook(token.tokenId);
      recordOrderBookSnapshot({
        tokenId: token.tokenId,
        marketSlug: token.marketSlug,
        eventSlug: token.eventSlug,
        marketId: token.marketId,
        side: token.side,
        strategySource: token.strategySource,
        expectedResolutionAt: token.expectedResolutionAt,
        orderbook,
      });
      snapshotsRecorded += 1;
    } catch (error) {
      const blockReason = classifyOrderBookTokenBlockReason(error);

      if (blockReason === null) {
        errors += 1;
      } else {
        blockedFailures += 1;
        recordOrderBookTokenBlock({
          tokenId: token.tokenId,
          marketSlug: token.marketSlug,
          reason: blockReason,
          blockMs: ORDERBOOK_TOKEN_BLOCK_MS,
        });
      }

      logger.warn(
        formatSnapshotSkipMessage({
          blockReason,
          error,
          tokenId: token.tokenId,
        }),
      );
    }
  }

  logger.info(
    `orderbook snapshots recorded: ${snapshotsRecorded}; blocked tokens skipped: ${blockedTokensSkipped}; new token blocks: ${blockedFailures}`,
  );

  return {
    success: errors === 0,
    candidateTokens: selectedTokens.length,
    snapshotsRecorded,
    errors,
    blockedFailures,
    blockedTokensSkipped,
  };
}

export async function collectSnapshotTokens(input: {
  fetchEvents?: (limit: number) => Promise<GammaRawEvent[]>;
  fetchNegRiskEvents?: (limit: number) => Promise<GammaRawEvent[]>;
  gammaEventLimit?: number;
  maxTokensPerMarket?: number;
  tokenLimit?: number;
}): Promise<OrderBookSnapshotToken[]> {
  const tokenLimit = input.tokenLimit ?? DEFAULT_SNAPSHOT_TOKEN_LIMIT;
  const gammaEventLimit = input.gammaEventLimit ?? DEFAULT_GAMMA_EVENT_LIMIT;
  const maxTokensPerMarket =
    input.maxTokensPerMarket ?? DEFAULT_MAX_TOKENS_PER_MARKET;
  const fetchEvents = input.fetchEvents ?? fetchActiveEvents;
  const fetchNegRisk = input.fetchNegRiskEvents ?? fetchNegRiskEvents;
  const [negRiskWatchTokens, withinMarketWatchTokens, gammaTokens] =
    await Promise.all([
      listNegRiskWatchTokens({
        fetchEvents: fetchNegRisk,
        limit: gammaEventLimit,
      }),
      listWithinMarketWatchTokens({
        fetchEvents,
        limit: gammaEventLimit,
      }),
      listGammaActiveMarketTokens({
        fetchEvents,
        limit: gammaEventLimit,
      }),
    ]);

  return selectDiverseTokens(
    [
      listRecentOpportunityTokens(tokenLimit * 3),
      negRiskWatchTokens,
      withinMarketWatchTokens,
      gammaTokens,
    ],
    tokenLimit,
    maxTokensPerMarket,
  );
}

function listRecentOpportunityTokens(limit: number): OrderBookSnapshotToken[] {
  const rows = getDb()
    .prepare<{
      expected_resolution_at: number | null;
      slug: string | null;
      token_ids: string | null;
    }>(
      `
      SELECT slug, token_ids, expected_resolution_at
      FROM opportunities
      WHERE token_ids IS NOT NULL
      ORDER BY
        CASE status
          WHEN 'paper_fired' THEN 0
          WHEN 'validated' THEN 1
          WHEN 'rejected' THEN 2
          ELSE 3
        END,
        COALESCE(executable_edge, raw_edge, 0) DESC,
        timestamp DESC
      LIMIT ?
      `,
    )
    .all(Math.max(limit, 1));

  return rows.flatMap((row) =>
      parseTokenIds(row.token_ids).map((tokenId) => ({
        tokenId,
        marketSlug: row.slug,
        expectedResolutionAt: row.expected_resolution_at,
        strategySource: "recent_opportunity",
      })),
  );
}

async function listNegRiskWatchTokens(input: {
  fetchEvents: (limit: number) => Promise<GammaRawEvent[]>;
  limit: number;
}): Promise<OrderBookSnapshotToken[]> {
  try {
    const events = await input.fetchEvents(input.limit);
    const candidates = events.flatMap((event) => {
      const eventSlug = getOptionalString(event.slug);
      const eventResolutionAt = deriveExpectedResolutionAt(event);
      const markets = Array.isArray(event.markets) ? event.markets : [];

      if (!eventSlug || markets.length < 3) {
        return [];
      }

      const legs = markets.flatMap(
        (
          market,
        ): Array<{
          marketSlug: string;
          marketId: string;
          noTokenId: string;
          expectedResolutionAt?: number | null;
          yesPrice: number;
        }> => {
          try {
            const normalized = normalizeGammaMarket(market);
            const noTokenId = normalized.clobTokenIds[1];
            const yesPrice = Number(normalized.outcomePrices[0]);
            const expectedResolutionAt =
              normalized.expectedResolutionAt ?? eventResolutionAt;

            if (!normalized.slug || !noTokenId || !isPlausiblePrice(yesPrice)) {
              return [];
            }

            return [
              {
                marketSlug: normalized.slug,
                marketId: normalized.id,
                noTokenId,
                ...(expectedResolutionAt ? { expectedResolutionAt } : {}),
                yesPrice,
              },
            ];
          } catch {
            return [];
          }
        },
      );

      if (legs.length < 3) {
        return [];
      }

      const sumYes = legs.reduce((sum, leg) => sum + leg.yesPrice, 0);

      if (sumYes <= NEG_RISK_WATCH_SUM_YES) {
        return [];
      }

      return legs.map(
        (leg): OrderBookSnapshotToken => ({
          tokenId: leg.noTokenId,
          marketSlug: leg.marketSlug,
          eventSlug,
          marketId: leg.marketId,
          side: "NO",
          strategySource: "neg_risk_watch",
          expectedResolutionAt: leg.expectedResolutionAt,
        }),
      );
    });

    return candidates;
  } catch {
    return [];
  }
}

async function listWithinMarketWatchTokens(input: {
  fetchEvents: (limit: number) => Promise<GammaRawEvent[]>;
  limit: number;
}): Promise<OrderBookSnapshotToken[]> {
  try {
    const events = await input.fetchEvents(input.limit);
    const candidates = events.flatMap((event) => {
      const eventResolutionAt = deriveExpectedResolutionAt(event);
      const markets = Array.isArray(event.markets) ? event.markets : [];

      return markets.flatMap((market): OrderBookSnapshotToken[] => {
        try {
          const normalized = normalizeGammaMarket(market);
          const [yesTokenId, noTokenId] = normalized.clobTokenIds;
          const askYes = Number(normalized.outcomePrices[0]);
          const askNo = Number(normalized.outcomePrices[1]);

          if (
            !normalized.slug ||
            !yesTokenId ||
            !noTokenId ||
            !isPlausiblePrice(askYes) ||
            !isPlausiblePrice(askNo)
          ) {
            return [];
          }

          const totalCost = askYes + askNo;
          const expectedResolutionAt =
            normalized.expectedResolutionAt ?? eventResolutionAt;

          if (totalCost > WITHIN_MARKET_WATCH_TOTAL_COST) {
            return [];
          }

          return [
            {
              tokenId: yesTokenId,
              marketSlug: normalized.slug,
              marketId: normalized.id,
              side: "YES",
              strategySource: "within_market_watch",
              ...(expectedResolutionAt ? { expectedResolutionAt } : {}),
            },
            {
              tokenId: noTokenId,
              marketSlug: normalized.slug,
              marketId: normalized.id,
              side: "NO",
              strategySource: "within_market_watch",
              ...(expectedResolutionAt ? { expectedResolutionAt } : {}),
            },
          ];
        } catch {
          return [];
        }
      });
    });

    return candidates;
  } catch {
    return [];
  }
}

async function listGammaActiveMarketTokens(input: {
  fetchEvents: (limit: number) => Promise<GammaRawEvent[]>;
  limit: number;
}): Promise<OrderBookSnapshotToken[]> {
  try {
    const events = await input.fetchEvents(input.limit);

    return events.flatMap((event) => {
      const eventResolutionAt = deriveExpectedResolutionAt(event);

      return (event.markets ?? []).flatMap((market) => {
        try {
          const normalized = normalizeGammaMarket(market);
          const expectedResolutionAt =
            normalized.expectedResolutionAt ?? eventResolutionAt;

          return normalized.clobTokenIds.map(
            (tokenId, index): OrderBookSnapshotToken => ({
              tokenId,
              marketSlug: normalized.slug,
              marketId: normalized.id,
              side: normalizeOutcomeSide(normalized.outcomes[index]),
              strategySource: "gamma_active_market",
              ...(expectedResolutionAt ? { expectedResolutionAt } : {}),
            }),
          );
        } catch {
          return [];
        }
      });
    });
  } catch {
    return [];
  }
}

function selectDiverseTokens(
  buckets: OrderBookSnapshotToken[][],
  tokenLimit: number,
  maxTokensPerMarket: number,
): OrderBookSnapshotToken[] {
  const selected: OrderBookSnapshotToken[] = [];
  const seenTokens = new Set<string>();
  const marketCounts = new Map<string, number>();
  const indexes = buckets.map(() => 0);

  while (selected.length < tokenLimit) {
    let progressed = false;

    for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex += 1) {
      const bucket = buckets[bucketIndex] ?? [];

      while (indexes[bucketIndex] < bucket.length) {
        const candidate = bucket[indexes[bucketIndex]];

        indexes[bucketIndex] += 1;

        if (
          candidate !== undefined &&
          addCandidateToken({
            candidate,
            maxTokensPerMarket,
            marketCounts,
            selected,
            seenTokens,
            tokenLimit,
            useMarketCap: true,
          })
        ) {
          progressed = true;
          break;
        }
      }

      if (selected.length >= tokenLimit) {
        break;
      }
    }

    if (!progressed) {
      break;
    }
  }

  if (selected.length < tokenLimit) {
    for (const candidate of buckets.flat()) {
      addCandidateToken({
        candidate,
        maxTokensPerMarket,
        marketCounts,
        selected,
        seenTokens,
        tokenLimit,
        useMarketCap: false,
      });

      if (selected.length >= tokenLimit) {
        break;
      }
    }
  }

  return selected;
}

function addCandidateToken(input: {
  candidate: OrderBookSnapshotToken;
  maxTokensPerMarket: number;
  marketCounts: Map<string, number>;
  selected: OrderBookSnapshotToken[];
  seenTokens: Set<string>;
  tokenLimit: number;
  useMarketCap: boolean;
}): boolean {
  const tokenId = input.candidate.tokenId.trim();
  const marketKey = input.candidate.marketSlug ?? "unknown";
  const marketCount = input.marketCounts.get(marketKey) ?? 0;

  if (!tokenId) {
    return false;
  }

  if (input.seenTokens.has(tokenId)) {
    mergeSnapshotTokenMetadata(input.selected, {
      ...input.candidate,
      tokenId,
    });
    return false;
  }

  if (input.useMarketCap && marketCount >= input.maxTokensPerMarket) {
    return false;
  }

  input.seenTokens.add(tokenId);
  input.marketCounts.set(marketKey, marketCount + 1);
  input.selected.push({
    tokenId,
    marketSlug: input.candidate.marketSlug,
    eventSlug: input.candidate.eventSlug,
    marketId: input.candidate.marketId,
    side: input.candidate.side,
    strategySource: input.candidate.strategySource,
    expectedResolutionAt: input.candidate.expectedResolutionAt,
  });

  return input.selected.length <= input.tokenLimit;
}

function mergeSnapshotTokenMetadata(
  selected: OrderBookSnapshotToken[],
  candidate: OrderBookSnapshotToken,
): void {
  const existing = selected.find((token) => token.tokenId === candidate.tokenId);

  if (!existing) {
    return;
  }

  existing.marketSlug ??= candidate.marketSlug;
  existing.eventSlug ??= candidate.eventSlug;
  existing.marketId ??= candidate.marketId;
  existing.side ??= candidate.side;
  existing.strategySource ??= candidate.strategySource;
  existing.expectedResolutionAt ??= candidate.expectedResolutionAt;
}

function parseTokenIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (tokenId): tokenId is string =>
        typeof tokenId === "string" && tokenId.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function getOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isPlausiblePrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function normalizeOutcomeSide(value: unknown): "YES" | "NO" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "yes") {
    return "YES";
  }

  if (normalized === "no") {
    return "NO";
  }

  return null;
}

function classifyOrderBookTokenBlockReason(
  error: unknown,
): OrderBookTokenBlockReason | null {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("status code 404")) {
    return "orderbook_not_found";
  }

  if (message.includes("status code 400")) {
    return "invalid_orderbook_token";
  }

  return null;
}

function formatSnapshotSkipMessage(input: {
  blockReason: OrderBookTokenBlockReason | null;
  error: unknown;
  tokenId: string;
}): string {
  const detail =
    input.error instanceof Error ? input.error.message : String(input.error);

  if (input.blockReason === null) {
    return `orderbook snapshot skipped for token ${input.tokenId}: ${detail}`;
  }

  return `orderbook token blocked for 24h (${input.blockReason}) ${input.tokenId}: ${detail}`;
}
