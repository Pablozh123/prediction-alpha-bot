import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";
import type { CapitalLockClass } from "../utils/marketTime.js";

export type OpportunityStatus =
  | "raw_found"
  | "validated"
  | "rejected"
  | "paper_fired";

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
  status: OpportunityStatus;
  reason: string | null;
  token_ids: string | null;
  timestamp: number;
};

type StatusCountRow = {
  status: OpportunityStatus;
  count: number;
};

export function recordOpportunity(
  input: RecordOpportunityInput
): OpportunityRecord {
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
    status: input.status ?? "raw_found",
    reason: input.reason ?? null,
    tokenIds: input.tokenIds ?? [],
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
        @status,
        @reason,
        @tokenIds,
        @timestamp
      )
      `
    )
    .run({
      ...record,
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
      reason: input.reason ?? null
    });

  const row = getDb()
    .prepare<OpportunityRow>(
      `
      SELECT
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
        status,
        reason,
        token_ids,
        timestamp
      FROM opportunities
      WHERE id = ?
      `
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
      `
      SELECT
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
        status,
        reason,
        token_ids,
        timestamp
      FROM opportunities
      ORDER BY timestamp DESC
      LIMIT ?
      `
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
      SELECT
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
        status,
        reason,
        token_ids,
        timestamp
      FROM opportunities
      WHERE status = 'rejected'
      ORDER BY timestamp DESC
      LIMIT ?
      `
    )
    .all(limit)
    .map(mapOpportunityRow);
}

export function countOpportunitiesByStatus(): Record<OpportunityStatus, number> {
  const counts: Record<OpportunityStatus, number> = {
    raw_found: 0,
    validated: 0,
    rejected: 0,
    paper_fired: 0
  };

  for (const row of getDb()
    .prepare<StatusCountRow>(
      `
      SELECT status, COUNT(*) AS count
      FROM opportunities
      GROUP BY status
      `
    )
    .all()) {
    counts[row.status] = row.count;
  }

  return counts;
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
    status: row.status,
    reason: row.reason,
    tokenIds: parseTokenIds(row.token_ids),
    timestamp: row.timestamp
  };
}

function parseTokenIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tokenId): tokenId is string => typeof tokenId === "string")
      : [];
  } catch {
    return [];
  }
}
