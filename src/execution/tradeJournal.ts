import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type PaperTradeSide = "YES" | "NO";

export type RecordPaperTradeInput = {
  strategy: string;
  side: PaperTradeSide;
  sizeUsd: number;
  sizeShares?: number;
  entryPrice: number;
  slug?: string;
  question?: string;
  tokenId?: string;
  opportunityId?: string;
  arbClass?: string;
  timestamp?: number;
};

export type PaperTrade = {
  id: string;
  strategy: string;
  slug: string | null;
  question: string | null;
  tokenId: string | null;
  opportunityId: string | null;
  side: PaperTradeSide;
  sizeUsd: number;
  sizeShares: number | null;
  entryPrice: number;
  exitPrice: number | null;
  resolved: boolean;
  pnl: number | null;
  inflationFlagged: boolean;
  resolutionReason: string | null;
  arbClass: string | null;
  timestamp: number;
  resolvedAt: number | null;
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

export function recordPaperTrade(input: RecordPaperTradeInput): PaperTrade {
  const trade: PaperTrade = {
    id: uuidv4(),
    strategy: input.strategy,
    slug: input.slug ?? null,
    question: input.question ?? null,
    tokenId: input.tokenId ?? null,
    opportunityId: input.opportunityId ?? null,
    side: input.side,
    sizeUsd: input.sizeUsd,
    sizeShares: input.sizeShares ?? null,
    entryPrice: input.entryPrice,
    exitPrice: null,
    resolved: false,
    pnl: null,
    inflationFlagged: false,
    resolutionReason: null,
    arbClass: input.arbClass ?? null,
    timestamp: input.timestamp ?? Date.now(),
    resolvedAt: null
  };

  getDb()
    .prepare(
      `
      INSERT INTO paper_trades (
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
      ) VALUES (
        @id,
        @strategy,
        @slug,
        @question,
        @tokenId,
        @opportunityId,
        @side,
        @sizeUsd,
        @sizeShares,
        @entryPrice,
        @exitPrice,
        @resolved,
        @pnl,
        @inflationFlagged,
        @resolutionReason,
        @arbClass,
        @timestamp,
        @resolvedAt
      )
      `
    )
    .run({
      ...trade,
      resolved: trade.resolved ? 1 : 0,
      inflationFlagged: trade.inflationFlagged ? 1 : 0
    });

  return trade;
}

export function listRecentPaperTrades(limit: number): PaperTrade[] {
  const rows = getDb()
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
      ORDER BY timestamp DESC
      LIMIT ?
      `
    )
    .all(limit);

  return rows.map(mapPaperTradeRow);
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
