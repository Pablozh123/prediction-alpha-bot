import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";
import { getBestBidAsk, type OrderBook, type OrderBookLevel } from "../utils/orderbook.js";

export type RecordOrderBookSnapshotInput = {
  tokenId: string;
  orderbook: OrderBook;
  marketSlug?: string | null;
  eventSlug?: string | null;
  marketId?: string | null;
  side?: "YES" | "NO" | null;
  strategySource?: string | null;
  expectedResolutionAt?: number | null;
  opportunityId?: string | null;
  source?: string;
  capturedAt?: number;
};

export type OrderBookSnapshotRecord = {
  id: string;
  tokenId: string;
  marketSlug: string | null;
  eventSlug: string | null;
  marketId: string | null;
  side: "YES" | "NO" | null;
  strategySource: string | null;
  expectedResolutionAt: number | null;
  opportunityId: string | null;
  source: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  checksum: string;
  capturedAt: number;
};

type OrderBookSnapshotRow = {
  id: string;
  token_id: string;
  market_slug: string | null;
  event_slug: string | null;
  market_id: string | null;
  side: "YES" | "NO" | null;
  strategy_source: string | null;
  expected_resolution_at: number | null;
  opportunity_id: string | null;
  source: string;
  bids_json: string;
  asks_json: string;
  best_bid: number | null;
  best_ask: number | null;
  checksum: string;
  captured_at: number;
};

export function recordOrderBookSnapshot(
  input: RecordOrderBookSnapshotInput
): OrderBookSnapshotRecord {
  if (!input.tokenId.trim()) {
    throw new Error("Cannot record orderbook snapshot: tokenId is required.");
  }

  const bids = sanitizeLevels(input.orderbook.bids);
  const asks = sanitizeLevels(input.orderbook.asks);
  const best = getBestBidAsk({ tokenId: input.tokenId, bids, asks });
  const bidsJson = JSON.stringify(bids);
  const asksJson = JSON.stringify(asks);
  const checksum = createSnapshotChecksum({
    asksJson,
    bidsJson,
    source: input.source ?? "clob_current_book",
    tokenId: input.tokenId
  });
  const record: OrderBookSnapshotRecord = {
    id: uuidv4(),
    tokenId: input.tokenId,
    marketSlug: input.marketSlug ?? null,
    eventSlug: input.eventSlug ?? null,
    marketId: input.marketId ?? null,
    side: input.side ?? null,
    strategySource: input.strategySource ?? null,
    expectedResolutionAt: input.expectedResolutionAt ?? null,
    opportunityId: input.opportunityId ?? null,
    source: input.source ?? "clob_current_book",
    bids,
    asks,
    bestBid: best.bestBid,
    bestAsk: best.bestAsk,
    checksum,
    capturedAt: input.capturedAt ?? Date.now()
  };

  getDb()
    .prepare(
      `
      INSERT INTO orderbook_snapshots (
        id,
        token_id,
        market_slug,
        event_slug,
        market_id,
        side,
        strategy_source,
        expected_resolution_at,
        opportunity_id,
        source,
        bids_json,
        asks_json,
        best_bid,
        best_ask,
        checksum,
        captured_at
      ) VALUES (
        @id,
        @tokenId,
        @marketSlug,
        @eventSlug,
        @marketId,
        @side,
        @strategySource,
        @expectedResolutionAt,
        @opportunityId,
        @source,
        @bidsJson,
        @asksJson,
        @bestBid,
        @bestAsk,
        @checksum,
        @capturedAt
      )
      `
    )
    .run({
      ...record,
      bidsJson,
      asksJson
    });

  return record;
}

export function listRecentOrderBookSnapshots(
  limit: number
): OrderBookSnapshotRecord[] {
  return getDb()
    .prepare<OrderBookSnapshotRow>(
      `
      SELECT
        id,
        token_id,
        market_slug,
        event_slug,
        market_id,
        side,
        strategy_source,
        expected_resolution_at,
        opportunity_id,
        source,
        bids_json,
        asks_json,
        best_bid,
        best_ask,
        checksum,
        captured_at
      FROM orderbook_snapshots
      ORDER BY captured_at DESC
      LIMIT ?
      `
    )
    .all(limit)
    .map(mapSnapshotRow);
}

function mapSnapshotRow(row: OrderBookSnapshotRow): OrderBookSnapshotRecord {
  return {
    id: row.id,
    tokenId: row.token_id,
    marketSlug: row.market_slug,
    eventSlug: row.event_slug,
    marketId: row.market_id,
    side: row.side,
    strategySource: row.strategy_source,
    expectedResolutionAt: row.expected_resolution_at,
    opportunityId: row.opportunity_id,
    source: row.source,
    bids: parseLevels(row.bids_json),
    asks: parseLevels(row.asks_json),
    bestBid: row.best_bid,
    bestAsk: row.best_ask,
    checksum: row.checksum,
    capturedAt: row.captured_at
  };
}

function sanitizeLevels(levels: OrderBookLevel[]): OrderBookLevel[] {
  return levels
    .filter(
      (level) =>
        Number.isFinite(level.price) &&
        level.price > 0 &&
        level.price < 1 &&
        Number.isFinite(level.size) &&
        level.size > 0
    )
    .map((level) => ({
      price: roundPrice(level.price),
      size: roundSize(level.size)
    }));
}

function parseLevels(value: string): OrderBookLevel[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((level): OrderBookLevel[] => {
      if (
        typeof level === "object" &&
        level !== null &&
        "price" in level &&
        "size" in level
      ) {
        const price = Number(level.price);
        const size = Number(level.size);

        if (
          Number.isFinite(price) &&
          price > 0 &&
          price < 1 &&
          Number.isFinite(size) &&
          size > 0
        ) {
          return [{ price, size }];
        }
      }

      return [];
    });
  } catch {
    return [];
  }
}

function createSnapshotChecksum(input: {
  asksJson: string;
  bidsJson: string;
  source: string;
  tokenId: string;
}): string {
  return createHash("sha256")
    .update(input.tokenId)
    .update("|")
    .update(input.source)
    .update("|")
    .update(input.bidsJson)
    .update("|")
    .update(input.asksJson)
    .digest("hex");
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundSize(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
