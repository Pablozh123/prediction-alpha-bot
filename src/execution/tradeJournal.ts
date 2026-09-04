import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type PaperTradeSide = "YES" | "NO";

/**
 * Whether a paper trade can be joined to the candidate that caused it.
 * `linked` is written at fire time; `backfilled` means a later join found the
 * candidate; `legacy_unlinked` marks the rows written before the journal
 * existed, which no join can recover. Only `linked` and `backfilled` rows
 * belong in a resolved-sample analysis.
 */
export type PaperTradeLinkStatus = "linked" | "backfilled" | "legacy_unlinked";

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
  linkStatus: PaperTradeLinkStatus | null;
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
  link_status: PaperTradeLinkStatus | null;
  timestamp: number;
  resolved_at: number | null;
};

const SELECT_COLUMNS = `
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
`;

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
    linkStatus: input.opportunityId ? "linked" : null,
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
        link_status,
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
        @linkStatus,
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
      `SELECT ${SELECT_COLUMNS} FROM paper_trades ORDER BY timestamp DESC LIMIT ?`
    )
    .all(limit);

  return rows.map(mapPaperTradeRow);
}

export type PaperTradeSummary = {
  total: number;
  open: number;
  resolved: number;
  resolvedLinked: number;
  resolvedPnlUsd: number | null;
  unlinked: number;
  legacyUnlinked: number;
  firedSince: number;
};

/**
 * Counts for the published summary. PnL is only summed over resolved rows that
 * are linked to a candidate and not inflation-flagged; if there are none it is
 * null, never zero.
 */
export function summarizePaperTrades(sinceMs: number): PaperTradeSummary {
  type Row = {
    total: number;
    open: number;
    resolved: number;
    resolved_linked: number;
    resolved_pnl: number | null;
    unlinked: number;
    legacy_unlinked: number;
    fired_since: number;
  };

  const row = getDb()
    .prepare<Row>(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) AS resolved,
        SUM(
          CASE
            WHEN resolved = 1
              AND opportunity_id IS NOT NULL
              AND inflation_flagged = 0
            THEN 1 ELSE 0
          END
        ) AS resolved_linked,
        SUM(
          CASE
            WHEN resolved = 1
              AND opportunity_id IS NOT NULL
              AND inflation_flagged = 0
            THEN pnl ELSE NULL
          END
        ) AS resolved_pnl,
        SUM(CASE WHEN opportunity_id IS NULL THEN 1 ELSE 0 END) AS unlinked,
        SUM(CASE WHEN link_status = 'legacy_unlinked' THEN 1 ELSE 0 END) AS legacy_unlinked,
        SUM(CASE WHEN timestamp >= @sinceMs THEN 1 ELSE 0 END) AS fired_since
      FROM paper_trades
      `
    )
    .get({ sinceMs }) as Row | undefined;

  const resolvedLinked = row?.resolved_linked ?? 0;

  return {
    total: row?.total ?? 0,
    open: row?.open ?? 0,
    resolved: row?.resolved ?? 0,
    resolvedLinked,
    resolvedPnlUsd:
      resolvedLinked > 0 && row?.resolved_pnl !== null && row?.resolved_pnl !== undefined
        ? Math.round((row.resolved_pnl + Number.EPSILON) * 100) / 100
        : null,
    unlinked: row?.unlinked ?? 0,
    legacyUnlinked: row?.legacy_unlinked ?? 0,
    firedSince: row?.fired_since ?? 0
  };
}

export function countPaperTradesByStrategySince(
  sinceMs: number
): Array<{ strategy: string; count: number }> {
  return getDb()
    .prepare<{ strategy: string; count: number }>(
      `
      SELECT strategy, COUNT(*) AS count
      FROM paper_trades
      WHERE timestamp >= ?
      GROUP BY strategy
      ORDER BY count DESC, strategy ASC
      `
    )
    .all(sinceMs);
}

export function setPaperTradeLink(
  tradeId: string,
  opportunityId: string | null,
  linkStatus: PaperTradeLinkStatus
): void {
  getDb()
    .prepare(
      `
      UPDATE paper_trades
      SET opportunity_id = COALESCE(@opportunityId, opportunity_id),
          link_status = @linkStatus
      WHERE id = @tradeId
      `
    )
    .run({ tradeId, opportunityId, linkStatus });
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
