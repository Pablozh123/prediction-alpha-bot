import { getDb } from "./db.js";

export const DEFAULT_ORDERBOOK_TOKEN_BLOCK_MS = 86_400_000;

export type OrderBookTokenBlockReason =
  | "orderbook_not_found"
  | "invalid_orderbook_token";

export type RecordOrderBookTokenBlockInput = {
  tokenId: string;
  reason: OrderBookTokenBlockReason;
  marketSlug?: string | null;
  failedAt?: number;
  blockMs?: number;
};

export type OrderBookTokenBlockRecord = {
  tokenId: string;
  marketSlug: string | null;
  reason: OrderBookTokenBlockReason;
  failureCount: number;
  firstFailedAt: number;
  lastFailedAt: number;
  skipUntil: number;
};

type BlockableOrderBookToken = {
  tokenId: string;
  marketSlug?: string | null;
};

type OrderBookTokenBlockRow = {
  token_id: string;
  market_slug: string | null;
  reason: OrderBookTokenBlockReason;
  failure_count: number;
  first_failed_at: number;
  last_failed_at: number;
  skip_until: number;
};

export function recordOrderBookTokenBlock(
  input: RecordOrderBookTokenBlockInput
): OrderBookTokenBlockRecord {
  const tokenId = input.tokenId.trim();

  if (!tokenId) {
    throw new Error("Cannot block orderbook token: tokenId is required.");
  }

  const failedAt = input.failedAt ?? Date.now();
  const skipUntil = failedAt + (input.blockMs ?? DEFAULT_ORDERBOOK_TOKEN_BLOCK_MS);

  getDb()
    .prepare(
      `
      INSERT INTO orderbook_token_blocks (
        token_id,
        market_slug,
        reason,
        failure_count,
        first_failed_at,
        last_failed_at,
        skip_until
      ) VALUES (
        @tokenId,
        @marketSlug,
        @reason,
        1,
        @failedAt,
        @failedAt,
        @skipUntil
      )
      ON CONFLICT(token_id) DO UPDATE SET
        market_slug = COALESCE(excluded.market_slug, orderbook_token_blocks.market_slug),
        reason = excluded.reason,
        failure_count = orderbook_token_blocks.failure_count + 1,
        last_failed_at = excluded.last_failed_at,
        skip_until = excluded.skip_until
      `
    )
    .run({
      failedAt,
      marketSlug: input.marketSlug ?? null,
      reason: input.reason,
      skipUntil,
      tokenId
    });

  const record = getOrderBookTokenBlock(tokenId);

  if (!record) {
    throw new Error("Failed to read recorded orderbook token block.");
  }

  return record;
}

export function getOrderBookTokenBlock(
  tokenId: string
): OrderBookTokenBlockRecord | null {
  const row = getDb()
    .prepare<OrderBookTokenBlockRow>(
      `
      SELECT
        token_id,
        market_slug,
        reason,
        failure_count,
        first_failed_at,
        last_failed_at,
        skip_until
      FROM orderbook_token_blocks
      WHERE token_id = ?
      `
    )
    .get(tokenId);

  return row === undefined ? null : mapRow(row);
}

export function isOrderBookTokenBlocked(
  tokenId: string,
  nowMs = Date.now()
): boolean {
  const row = getDb()
    .prepare<{ token_id: string }>(
      `
      SELECT token_id
      FROM orderbook_token_blocks
      WHERE token_id = ?
        AND skip_until > ?
      `
    )
    .get(tokenId, nowMs);

  return row !== undefined;
}

export function filterBlockedOrderBookTokens<T extends BlockableOrderBookToken>(
  tokens: T[],
  nowMs = Date.now()
): {
  available: T[];
  blocked: T[];
} {
  const available: T[] = [];
  const blocked: T[] = [];

  for (const token of tokens) {
    if (isOrderBookTokenBlocked(token.tokenId, nowMs)) {
      blocked.push(token);
    } else {
      available.push(token);
    }
  }

  return {
    available,
    blocked
  };
}

export function countActiveOrderBookTokenBlocks(nowMs = Date.now()): number {
  return (
    getDb()
      .prepare<{ count: number }>(
        `
        SELECT COUNT(*) AS count
        FROM orderbook_token_blocks
        WHERE skip_until > ?
        `
      )
      .get(nowMs)?.count ?? 0
  );
}

export function listActiveOrderBookTokenBlocks(
  limit: number,
  nowMs = Date.now()
): OrderBookTokenBlockRecord[] {
  return getDb()
    .prepare<OrderBookTokenBlockRow>(
      `
      SELECT
        token_id,
        market_slug,
        reason,
        failure_count,
        first_failed_at,
        last_failed_at,
        skip_until
      FROM orderbook_token_blocks
      WHERE skip_until > ?
      ORDER BY last_failed_at DESC
      LIMIT ?
      `
    )
    .all(nowMs, Math.max(1, limit))
    .map(mapRow);
}

function mapRow(row: OrderBookTokenBlockRow): OrderBookTokenBlockRecord {
  return {
    tokenId: row.token_id,
    marketSlug: row.market_slug,
    reason: row.reason,
    failureCount: row.failure_count,
    firstFailedAt: row.first_failed_at,
    lastFailedAt: row.last_failed_at,
    skipUntil: row.skip_until
  };
}
