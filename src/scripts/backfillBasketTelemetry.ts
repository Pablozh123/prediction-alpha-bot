import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { calculateNegRiskBasketSizing } from "../scanner/basketSizing.js";
import type { OrderBook, OrderBookLevel } from "../utils/orderbook.js";

const require = createRequire(import.meta.url);

type SqliteDatabase = {
  prepare<T = unknown>(sql: string): {
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | undefined;
    run(...params: unknown[]): { changes: number };
  };
  close(): void;
};

type DatabaseConstructor = new (
  filename: string,
  options?: { fileMustExist?: boolean }
) => SqliteDatabase;

type OpportunityRow = {
  id: string;
  strategy: string;
  slug: string | null;
};

type OpportunityLegRow = {
  token_id: string;
  slug: string | null;
};

type SnapshotRow = {
  token_id: string;
  bids_json: string;
  asks_json: string;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const dbPath = resolve("logs", "trades.db");

if (!existsSync(dbPath)) {
  console.log(`basket backfill skipped: database not found at ${dbPath}`);
  process.exit(0);
}

const db = new Database(dbPath, { fileMustExist: true });

try {
  let backfilledOpportunities = 0;
  let updatedPaperTrades = 0;
  const opportunities = db
    .prepare<OpportunityRow>(
      `
      SELECT id, strategy, slug
      FROM opportunities
      WHERE strategy = 'neg_risk_bracket_arb'
        AND status = 'paper_fired'
        AND basket_size_shares IS NULL
      ORDER BY timestamp ASC
      `
    )
    .all();

  for (const opportunity of opportunities) {
    const legs = db
      .prepare<OpportunityLegRow>(
        `
        SELECT token_id, slug
        FROM opportunity_legs
        WHERE opportunity_id = ?
        ORDER BY leg_index ASC
        `
      )
      .all(opportunity.id);
    const snapshots = db
      .prepare<SnapshotRow>(
        `
        SELECT token_id, bids_json, asks_json
        FROM orderbook_snapshots
        WHERE opportunity_id = ?
        `
      )
      .all(opportunity.id);
    const snapshotByToken = new Map(
      snapshots.map((snapshot) => [snapshot.token_id, snapshot])
    );

    const sizing = calculateNegRiskBasketSizing(
      legs.map((leg) => ({
        tokenId: leg.token_id,
        slug: leg.slug ?? opportunity.slug ?? "unknown",
        orderbook: parseSnapshot(snapshotByToken.get(leg.token_id))
      }))
    );

    if (!sizing) {
      continue;
    }

    db.prepare(
      `
      UPDATE opportunities
      SET
        basket_size_shares = @basketSizeShares,
        basket_cost_usd = @basketCostUsd,
        basket_payout_usd = @basketPayoutUsd,
        basket_profit_usd = @basketProfitUsd,
        edge_bps = @edgeBps,
        roi_bps = @roiBps,
        max_positive_basket_shares = @maxPositiveBasketShares,
        max_positive_basket_cost_usd = @maxPositiveBasketCostUsd
      WHERE id = @id
      `
    ).run({
      id: opportunity.id,
      basketSizeShares: sizing.basketSizeShares,
      basketCostUsd: sizing.basketCostUsd,
      basketPayoutUsd: sizing.basketPayoutUsd,
      basketProfitUsd: sizing.basketProfitUsd,
      edgeBps: sizing.edgeBps,
      roiBps: sizing.roiBps,
      maxPositiveBasketShares: sizing.maxPositiveBasketShares,
      maxPositiveBasketCostUsd: sizing.maxPositiveBasketCostUsd
    });
    backfilledOpportunities += 1;

    for (const leg of sizing.legs) {
      updatedPaperTrades += db
        .prepare(
          `
          UPDATE paper_trades
          SET
            size_usd = @sizeUsd,
            size_shares = @sizeShares,
            entry_price = @entryPrice
          WHERE opportunity_id = @opportunityId
            AND token_id = @tokenId
            AND resolved = 0
          `
        )
        .run({
          opportunityId: opportunity.id,
          tokenId: leg.tokenId,
          sizeUsd: leg.costUsd,
          sizeShares: leg.shares,
          entryPrice: leg.averageFillPrice
        }).changes;
    }
  }

  console.log(`basket opportunities backfilled: ${backfilledOpportunities}`);
  console.log(`paper trades updated: ${updatedPaperTrades}`);
} finally {
  db.close();
}

function parseSnapshot(snapshot: SnapshotRow | undefined): OrderBook | undefined {
  if (!snapshot) {
    return undefined;
  }

  return {
    tokenId: snapshot.token_id,
    bids: parseLevels(snapshot.bids_json),
    asks: parseLevels(snapshot.asks_json)
  };
}

function parseLevels(value: string): OrderBookLevel[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((level): OrderBookLevel[] => {
      if (!isLevelRecord(level)) {
        return [];
      }

      const price = Number(level.price);
      const size = Number(level.size);

      return Number.isFinite(price) && Number.isFinite(size) && size > 0
        ? [{ price, size }]
        : [];
    });
  } catch {
    return [];
  }
}

function isLevelRecord(value: unknown): value is {
  price: unknown;
  size: unknown;
} {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
