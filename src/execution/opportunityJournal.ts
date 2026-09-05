import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";
import type { CapitalLockClass } from "../utils/marketTime.js";
import type { RuleReviewStatus, RuleScreenStatus } from "../core/taxonomy.js";

/**
 * `candidate` is the status of a basket that passed structure,
 * executability, economics and the hurdle but is not fireable: its capital
 * lock is medium or long (carry), or it is a cross-venue pair whose rulebooks
 * no person has confirmed as equivalent. It is published as a carry
 * candidate, never as a rejection and never as a chance.
 */
export type OpportunityStatus =
  | "raw_found"
  | "validated"
  | "candidate"
  | "rejected"
  | "paper_fired";

export const OPPORTUNITY_STATUSES: readonly OpportunityStatus[] = [
  "raw_found",
  "validated",
  "candidate",
  "rejected",
  "paper_fired",
];

/**
 * The single rule field of the first schema, kept for readers of
 * `arb_scan/1`. It is derived from `rule_screen` and `rule_review` since
 * 2026-09-05 and no longer written by the scanner on its own.
 */
export type RuleMatchStatus = "unverified" | "reviewed" | "mismatch";

export type OpportunityTelemetryInput = {
  executableEdge?: number | null;
  fillableUsd?: number | null;
  minLegDepthUsd?: number | null;
  legCount?: number | null;
  executableSum?: number | null;
  feeAdjustedEdge?: number | null;
  basketSizeShares?: number | null;
  basketCostUsd?: number | null;
  basketPayoutUsd?: number | null;
  basketProfitUsd?: number | null;
  edgeBps?: number | null;
  roiBps?: number | null;
  maxPositiveBasketShares?: number | null;
  maxPositiveBasketCostUsd?: number | null;
  expectedResolutionAt?: number | null;
  durationHours?: number | null;
  capitalLockClass?: CapitalLockClass | null;
  opportunityKey?: string | null;
  title?: string | null;
  venues?: string[] | null;
  category?: string | null;
  grossEdgeBps?: number | null;
  netEdgeBps?: number | null;
  feeUsd?: number | null;
  capitalUsd?: number | null;
  depthUsd?: number | null;
  daysToResolution?: number | null;
  annualizedPct?: number | null;
  ruleMatch?: RuleMatchStatus | null;
  ruleScreen?: RuleScreenStatus | null;
  ruleReview?: RuleReviewStatus | null;
  gateFailed?: number | null;
  netProfitUsd?: number | null;
  resolutionAtKalshi?: number | null;
  resolutionAtPolymarket?: number | null;
};

export type RecordOpportunityInput = OpportunityTelemetryInput & {
  strategy: string;
  slug?: string;
  rawEdge?: number | null;
  status?: OpportunityStatus;
  reason?: string | null;
  tokenIds?: string[];
  timestamp?: number;
};

export type UpdateOpportunityInput = OpportunityTelemetryInput & {
  status: OpportunityStatus;
  reason?: string | null;
};

export type OpportunityRecord = {
  id: string;
  strategy: string;
  slug: string | null;
  rawEdge: number | null;
  executableEdge: number | null;
  fillableUsd: number | null;
  minLegDepthUsd: number | null;
  legCount: number | null;
  executableSum: number | null;
  feeAdjustedEdge: number | null;
  basketSizeShares: number | null;
  basketCostUsd: number | null;
  basketPayoutUsd: number | null;
  basketProfitUsd: number | null;
  edgeBps: number | null;
  roiBps: number | null;
  maxPositiveBasketShares: number | null;
  maxPositiveBasketCostUsd: number | null;
  expectedResolutionAt: number | null;
  durationHours: number | null;
  capitalLockClass: CapitalLockClass | null;
  opportunityKey: string | null;
  title: string | null;
  venues: string[];
  category: string | null;
  grossEdgeBps: number | null;
  netEdgeBps: number | null;
  feeUsd: number | null;
  capitalUsd: number | null;
  depthUsd: number | null;
  daysToResolution: number | null;
  annualizedPct: number | null;
  ruleMatch: RuleMatchStatus | null;
  ruleScreen: RuleScreenStatus | null;
  ruleReview: RuleReviewStatus | null;
  gateFailed: number | null;
  netProfitUsd: number | null;
  resolutionAtKalshi: number | null;
  resolutionAtPolymarket: number | null;
  status: OpportunityStatus;
  reason: string | null;
  tokenIds: string[];
  timestamp: number;
};

type OpportunityRow = {
  id: string;
  strategy: string;
  slug: string | null;
  raw_edge: number | null;
  executable_edge: number | null;
  fillable_usd: number | null;
  min_leg_depth_usd: number | null;
  leg_count: number | null;
  executable_sum: number | null;
  fee_adjusted_edge: number | null;
  basket_size_shares: number | null;
  basket_cost_usd: number | null;
  basket_payout_usd: number | null;
  basket_profit_usd: number | null;
  edge_bps: number | null;
  roi_bps: number | null;
  max_positive_basket_shares: number | null;
  max_positive_basket_cost_usd: number | null;
  expected_resolution_at: number | null;
  duration_hours: number | null;
  capital_lock_class: CapitalLockClass | null;
  opportunity_key: string | null;
  title: string | null;
  venues: string | null;
  category: string | null;
  gross_edge_bps: number | null;
  net_edge_bps: number | null;
  fee_usd: number | null;
  capital_usd: number | null;
  depth_usd: number | null;
  days_to_resolution: number | null;
  annualized_pct: number | null;
  rule_match: RuleMatchStatus | null;
  rule_screen: RuleScreenStatus | null;
  rule_review: RuleReviewStatus | null;
  gate_failed: number | null;
  net_profit_usd: number | null;
  resolution_at_kalshi: number | null;
  resolution_at_polymarket: number | null;
  status: OpportunityStatus;
  reason: string | null;
  token_ids: string | null;
  timestamp: number;
};

type StatusCountRow = {
  status: OpportunityStatus;
  count: number;
};

const SELECT_COLUMNS = `
  id,
  strategy,
  slug,
  raw_edge,
  executable_edge,
  fillable_usd,
  min_leg_depth_usd,
  leg_count,
  executable_sum,
  fee_adjusted_edge,
  basket_size_shares,
  basket_cost_usd,
  basket_payout_usd,
  basket_profit_usd,
  edge_bps,
  roi_bps,
  max_positive_basket_shares,
  max_positive_basket_cost_usd,
  expected_resolution_at,
  duration_hours,
  capital_lock_class,
  opportunity_key,
  title,
  venues,
  category,
  gross_edge_bps,
  net_edge_bps,
  fee_usd,
  capital_usd,
  depth_usd,
  days_to_resolution,
  annualized_pct,
  rule_match,
  rule_screen,
  rule_review,
  gate_failed,
  net_profit_usd,
  resolution_at_kalshi,
  resolution_at_polymarket,
  status,
  reason,
  token_ids,
  timestamp
`;

/**
 * Stable identity of a candidate across cycles: the same basket seen again
 * ten seconds later gets the same key, which is what `first_seen_at` and
 * `open_seconds` on the published feed are computed from.
 */
export function buildOpportunityKey(input: {
  strategy: string;
  slug?: string | null;
  tokenIds?: string[] | null;
}): string {
  const tokens = [...(input.tokenIds ?? [])].map((token) => token.trim()).filter(Boolean).sort();

  return [
    `strategy=${input.strategy}`,
    `slug=${(input.slug ?? "").trim()}`,
    `tokens=${tokens.join(",")}`,
  ].join("|");
}

export function recordOpportunity(
  input: RecordOpportunityInput
): OpportunityRecord {
  const tokenIds = input.tokenIds ?? [];
  const record: OpportunityRecord = {
    id: uuidv4(),
    strategy: input.strategy,
    slug: input.slug ?? null,
    rawEdge: input.rawEdge ?? null,
    executableEdge: input.executableEdge ?? null,
    fillableUsd: input.fillableUsd ?? null,
    minLegDepthUsd: input.minLegDepthUsd ?? null,
    legCount: input.legCount ?? null,
    executableSum: input.executableSum ?? null,
    feeAdjustedEdge: input.feeAdjustedEdge ?? null,
    basketSizeShares: input.basketSizeShares ?? null,
    basketCostUsd: input.basketCostUsd ?? null,
    basketPayoutUsd: input.basketPayoutUsd ?? null,
    basketProfitUsd: input.basketProfitUsd ?? null,
    edgeBps: input.edgeBps ?? null,
    roiBps: input.roiBps ?? null,
    maxPositiveBasketShares: input.maxPositiveBasketShares ?? null,
    maxPositiveBasketCostUsd: input.maxPositiveBasketCostUsd ?? null,
    expectedResolutionAt: input.expectedResolutionAt ?? null,
    durationHours: input.durationHours ?? null,
    capitalLockClass: input.capitalLockClass ?? null,
    opportunityKey:
      input.opportunityKey ??
      buildOpportunityKey({ strategy: input.strategy, slug: input.slug, tokenIds }),
    title: input.title ?? null,
    venues: input.venues ?? [],
    category: input.category ?? null,
    grossEdgeBps: input.grossEdgeBps ?? null,
    netEdgeBps: input.netEdgeBps ?? null,
    feeUsd: input.feeUsd ?? null,
    capitalUsd: input.capitalUsd ?? null,
    depthUsd: input.depthUsd ?? null,
    daysToResolution: input.daysToResolution ?? null,
    annualizedPct: input.annualizedPct ?? null,
    ruleMatch: input.ruleMatch ?? null,
    ruleScreen: input.ruleScreen ?? null,
    ruleReview: input.ruleReview ?? null,
    gateFailed: input.gateFailed ?? null,
    netProfitUsd: input.netProfitUsd ?? null,
    resolutionAtKalshi: input.resolutionAtKalshi ?? null,
    resolutionAtPolymarket: input.resolutionAtPolymarket ?? null,
    status: input.status ?? "raw_found",
    reason: input.reason ?? null,
    tokenIds,
    timestamp: input.timestamp ?? Date.now()
  };

  getDb()
    .prepare(
      `
      INSERT INTO opportunities (
        id,
        strategy,
        slug,
        raw_edge,
        executable_edge,
        fillable_usd,
        min_leg_depth_usd,
        leg_count,
        executable_sum,
        fee_adjusted_edge,
        basket_size_shares,
        basket_cost_usd,
        basket_payout_usd,
        basket_profit_usd,
        edge_bps,
        roi_bps,
        max_positive_basket_shares,
        max_positive_basket_cost_usd,
        expected_resolution_at,
        duration_hours,
        capital_lock_class,
        opportunity_key,
        title,
        venues,
        category,
        gross_edge_bps,
        net_edge_bps,
        fee_usd,
        capital_usd,
        depth_usd,
        days_to_resolution,
        annualized_pct,
        rule_match,
        rule_screen,
        rule_review,
        gate_failed,
        net_profit_usd,
        resolution_at_kalshi,
        resolution_at_polymarket,
        status,
        reason,
        token_ids,
        timestamp
      ) VALUES (
        @id,
        @strategy,
        @slug,
        @rawEdge,
        @executableEdge,
        @fillableUsd,
        @minLegDepthUsd,
        @legCount,
        @executableSum,
        @feeAdjustedEdge,
        @basketSizeShares,
        @basketCostUsd,
        @basketPayoutUsd,
        @basketProfitUsd,
        @edgeBps,
        @roiBps,
        @maxPositiveBasketShares,
        @maxPositiveBasketCostUsd,
        @expectedResolutionAt,
        @durationHours,
        @capitalLockClass,
        @opportunityKey,
        @title,
        @venues,
        @category,
        @grossEdgeBps,
        @netEdgeBps,
        @feeUsd,
        @capitalUsd,
        @depthUsd,
        @daysToResolution,
        @annualizedPct,
        @ruleMatch,
        @ruleScreen,
        @ruleReview,
        @gateFailed,
        @netProfitUsd,
        @resolutionAtKalshi,
        @resolutionAtPolymarket,
        @status,
        @reason,
        @tokenIds,
        @timestamp
      )
      `
    )
    .run({
      ...record,
      venues: JSON.stringify(record.venues),
      tokenIds: JSON.stringify(record.tokenIds)
    });

  return record;
}

export function updateOpportunityStatus(
  id: string,
  input: UpdateOpportunityInput
): OpportunityRecord {
  getDb()
    .prepare(
      `
      UPDATE opportunities
      SET
        status = @status,
        executable_edge = @executableEdge,
        fillable_usd = COALESCE(@fillableUsd, fillable_usd),
        min_leg_depth_usd = COALESCE(@minLegDepthUsd, min_leg_depth_usd),
        leg_count = COALESCE(@legCount, leg_count),
        executable_sum = COALESCE(@executableSum, executable_sum),
        fee_adjusted_edge = COALESCE(@feeAdjustedEdge, fee_adjusted_edge),
        basket_size_shares = COALESCE(@basketSizeShares, basket_size_shares),
        basket_cost_usd = COALESCE(@basketCostUsd, basket_cost_usd),
        basket_payout_usd = COALESCE(@basketPayoutUsd, basket_payout_usd),
        basket_profit_usd = COALESCE(@basketProfitUsd, basket_profit_usd),
        edge_bps = COALESCE(@edgeBps, edge_bps),
        roi_bps = COALESCE(@roiBps, roi_bps),
        max_positive_basket_shares = COALESCE(@maxPositiveBasketShares, max_positive_basket_shares),
        max_positive_basket_cost_usd = COALESCE(@maxPositiveBasketCostUsd, max_positive_basket_cost_usd),
        expected_resolution_at = COALESCE(@expectedResolutionAt, expected_resolution_at),
        duration_hours = COALESCE(@durationHours, duration_hours),
        capital_lock_class = COALESCE(@capitalLockClass, capital_lock_class),
        opportunity_key = COALESCE(@opportunityKey, opportunity_key),
        title = COALESCE(@title, title),
        venues = COALESCE(@venues, venues),
        category = COALESCE(@category, category),
        gross_edge_bps = COALESCE(@grossEdgeBps, gross_edge_bps),
        net_edge_bps = COALESCE(@netEdgeBps, net_edge_bps),
        fee_usd = COALESCE(@feeUsd, fee_usd),
        capital_usd = COALESCE(@capitalUsd, capital_usd),
        depth_usd = COALESCE(@depthUsd, depth_usd),
        days_to_resolution = COALESCE(@daysToResolution, days_to_resolution),
        annualized_pct = COALESCE(@annualizedPct, annualized_pct),
        rule_match = COALESCE(@ruleMatch, rule_match),
        rule_screen = COALESCE(@ruleScreen, rule_screen),
        rule_review = COALESCE(@ruleReview, rule_review),
        gate_failed = COALESCE(@gateFailed, gate_failed),
        net_profit_usd = COALESCE(@netProfitUsd, net_profit_usd),
        resolution_at_kalshi = COALESCE(@resolutionAtKalshi, resolution_at_kalshi),
        resolution_at_polymarket = COALESCE(@resolutionAtPolymarket, resolution_at_polymarket),
        reason = @reason
      WHERE id = @id
      `
    )
    .run({
      id,
      status: input.status,
      executableEdge: input.executableEdge ?? null,
      fillableUsd: input.fillableUsd ?? null,
      minLegDepthUsd: input.minLegDepthUsd ?? null,
      legCount: input.legCount ?? null,
      executableSum: input.executableSum ?? null,
      feeAdjustedEdge: input.feeAdjustedEdge ?? null,
      basketSizeShares: input.basketSizeShares ?? null,
      basketCostUsd: input.basketCostUsd ?? null,
      basketPayoutUsd: input.basketPayoutUsd ?? null,
      basketProfitUsd: input.basketProfitUsd ?? null,
      edgeBps: input.edgeBps ?? null,
      roiBps: input.roiBps ?? null,
      maxPositiveBasketShares: input.maxPositiveBasketShares ?? null,
      maxPositiveBasketCostUsd: input.maxPositiveBasketCostUsd ?? null,
      expectedResolutionAt: input.expectedResolutionAt ?? null,
      durationHours: input.durationHours ?? null,
      capitalLockClass: input.capitalLockClass ?? null,
      opportunityKey: input.opportunityKey ?? null,
      title: input.title ?? null,
      venues: input.venues ? JSON.stringify(input.venues) : null,
      category: input.category ?? null,
      grossEdgeBps: input.grossEdgeBps ?? null,
      netEdgeBps: input.netEdgeBps ?? null,
      feeUsd: input.feeUsd ?? null,
      capitalUsd: input.capitalUsd ?? null,
      depthUsd: input.depthUsd ?? null,
      daysToResolution: input.daysToResolution ?? null,
      annualizedPct: input.annualizedPct ?? null,
      ruleMatch: input.ruleMatch ?? null,
      ruleScreen: input.ruleScreen ?? null,
      ruleReview: input.ruleReview ?? null,
      gateFailed: input.gateFailed ?? null,
      netProfitUsd: input.netProfitUsd ?? null,
      resolutionAtKalshi: input.resolutionAtKalshi ?? null,
      resolutionAtPolymarket: input.resolutionAtPolymarket ?? null,
      reason: input.reason ?? null
    });

  const row = getDb()
    .prepare<OpportunityRow>(
      `SELECT ${SELECT_COLUMNS} FROM opportunities WHERE id = ?`
    )
    .get(id);

  if (!row) {
    throw new Error(`Opportunity "${id}" was not found after update.`);
  }

  return mapOpportunityRow(row);
}

export function listRecentOpportunities(limit: number): OpportunityRecord[] {
  return getDb()
    .prepare<OpportunityRow>(
      `SELECT ${SELECT_COLUMNS} FROM opportunities ORDER BY timestamp DESC LIMIT ?`
    )
    .all(limit)
    .map(mapOpportunityRow);
}

export function listRecentRejectedOpportunities(
  limit: number
): OpportunityRecord[] {
  return getDb()
    .prepare<OpportunityRow>(
      `
      SELECT ${SELECT_COLUMNS}
      FROM opportunities
      WHERE status = 'rejected'
      ORDER BY timestamp DESC
      LIMIT ?
      `
    )
    .all(limit)
    .map(mapOpportunityRow);
}

export function getOpportunityById(id: string): OpportunityRecord | null {
  const row = getDb()
    .prepare<OpportunityRow>(`SELECT ${SELECT_COLUMNS} FROM opportunities WHERE id = ?`)
    .get(id);

  return row ? mapOpportunityRow(row) : null;
}

/**
 * Newest row per opportunity key inside a window, plus when that key was first
 * and last seen inside the window. The publisher reads this: one line per
 * distinct basket, not one per cycle.
 */
export type OpportunityWindowRow = OpportunityRecord & {
  firstSeenAt: number;
  lastSeenAt: number;
  sightings: number;
};

export function listLatestOpportunitiesByKey(
  sinceMs: number,
  limit: number
): OpportunityWindowRow[] {
  type Row = OpportunityRow & {
    first_seen_at: number;
    last_seen_at: number;
    sightings: number;
  };

  return getDb()
    .prepare<Row>(
      `
      WITH windowed AS (
        SELECT
          o.*,
          MIN(o.timestamp) OVER (PARTITION BY o.opportunity_key) AS first_seen_at,
          MAX(o.timestamp) OVER (PARTITION BY o.opportunity_key) AS last_seen_at,
          COUNT(*) OVER (PARTITION BY o.opportunity_key) AS sightings,
          ROW_NUMBER() OVER (
            PARTITION BY o.opportunity_key
            ORDER BY o.timestamp DESC, o.id DESC
          ) AS row_rank
        FROM opportunities o
        WHERE o.timestamp >= ? AND o.opportunity_key IS NOT NULL
      )
      SELECT ${SELECT_COLUMNS}, first_seen_at, last_seen_at, sightings
      FROM windowed
      WHERE row_rank = 1
      ORDER BY last_seen_at DESC
      LIMIT ?
      `
    )
    .all(sinceMs, limit)
    .map((row) => ({
      ...mapOpportunityRow(row),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      sightings: row.sightings,
    }));
}

export function countRejectionReasonsSince(
  sinceMs: number,
  strategy?: string
): Array<{ reason: string; count: number }> {
  type Row = { reason: string | null; count: number };
  const rows = strategy
    ? getDb()
        .prepare<Row>(
          `
          SELECT reason, COUNT(*) AS count
          FROM opportunities
          WHERE status = 'rejected' AND timestamp >= ? AND strategy = ?
          GROUP BY reason
          ORDER BY count DESC, reason ASC
          `
        )
        .all(sinceMs, strategy)
    : getDb()
        .prepare<Row>(
          `
          SELECT reason, COUNT(*) AS count
          FROM opportunities
          WHERE status = 'rejected' AND timestamp >= ?
          GROUP BY reason
          ORDER BY count DESC, reason ASC
          `
        )
        .all(sinceMs);

  return rows.map((row) => ({ reason: row.reason ?? "other", count: row.count }));
}

export function countOpportunitiesByStatusSince(
  sinceMs: number,
  strategy?: string
): Record<OpportunityStatus, number> {
  const counts: Record<OpportunityStatus, number> = {
    raw_found: 0,
    validated: 0,
    candidate: 0,
    rejected: 0,
    paper_fired: 0
  };
  const rows = strategy
    ? getDb()
        .prepare<StatusCountRow>(
          `
          SELECT status, COUNT(*) AS count
          FROM opportunities
          WHERE timestamp >= ? AND strategy = ?
          GROUP BY status
          `
        )
        .all(sinceMs, strategy)
    : getDb()
        .prepare<StatusCountRow>(
          `
          SELECT status, COUNT(*) AS count
          FROM opportunities
          WHERE timestamp >= ?
          GROUP BY status
          `
        )
        .all(sinceMs);

  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status] = row.count;
    }
  }

  return counts;
}

export function countOpportunitiesByStatus(): Record<OpportunityStatus, number> {
  return countOpportunitiesByStatusSince(0);
}

function mapOpportunityRow(row: OpportunityRow): OpportunityRecord {
  return {
    id: row.id,
    strategy: row.strategy,
    slug: row.slug,
    rawEdge: row.raw_edge,
    executableEdge: row.executable_edge,
    fillableUsd: row.fillable_usd,
    minLegDepthUsd: row.min_leg_depth_usd,
    legCount: row.leg_count,
    executableSum: row.executable_sum,
    feeAdjustedEdge: row.fee_adjusted_edge,
    basketSizeShares: row.basket_size_shares,
    basketCostUsd: row.basket_cost_usd,
    basketPayoutUsd: row.basket_payout_usd,
    basketProfitUsd: row.basket_profit_usd,
    edgeBps: row.edge_bps,
    roiBps: row.roi_bps,
    maxPositiveBasketShares: row.max_positive_basket_shares,
    maxPositiveBasketCostUsd: row.max_positive_basket_cost_usd,
    expectedResolutionAt: row.expected_resolution_at,
    durationHours: row.duration_hours,
    capitalLockClass: row.capital_lock_class,
    opportunityKey: row.opportunity_key,
    title: row.title,
    venues: parseStringArray(row.venues),
    category: row.category,
    grossEdgeBps: row.gross_edge_bps,
    netEdgeBps: row.net_edge_bps,
    feeUsd: row.fee_usd,
    capitalUsd: row.capital_usd,
    depthUsd: row.depth_usd,
    daysToResolution: row.days_to_resolution,
    annualizedPct: row.annualized_pct,
    ruleMatch: row.rule_match,
    ruleScreen: row.rule_screen,
    ruleReview: row.rule_review,
    gateFailed: row.gate_failed,
    netProfitUsd: row.net_profit_usd,
    resolutionAtKalshi: row.resolution_at_kalshi,
    resolutionAtPolymarket: row.resolution_at_polymarket,
    status: row.status,
    reason: row.reason,
    tokenIds: parseStringArray(row.token_ids),
    timestamp: row.timestamp
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
