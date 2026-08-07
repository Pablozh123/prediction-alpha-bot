import { getDb } from "../execution/db.js";
import {
  scanNegRiskBracketArbs,
  type NegRiskBracketOpportunity,
} from "./negRiskBracketScanner.js";
import { latestKnownResolutionAt } from "../utils/marketTime.js";

export const NEG_RISK_SNAPSHOT_REASON =
  "snapshot_no_basket_positive_edge_limited_coverage";
export const DEFAULT_NEG_RISK_SNAPSHOT_MIN_EDGE = 0;
export const DEFAULT_NEG_RISK_SNAPSHOT_MAX_STALENESS_MS = 600_000;
export const DEFAULT_NEG_RISK_SNAPSHOT_MAX_LEGS = 16;
export const DEFAULT_NEG_RISK_SNAPSHOT_LIMIT = 20_000;

export type NegRiskSnapshotRow = {
  tokenId: string;
  marketSlug: string | null;
  eventSlug: string | null;
  marketId: string | null;
  side: "YES" | "NO" | null;
  bestAsk: number | null;
  expectedResolutionAt?: number | null;
  capturedAt: number;
};

export type ScanNegRiskSnapshotOptions = {
  maxLegs?: number;
  maxSnapshotStalenessMs?: number;
  minEdge?: number;
  rows?: NegRiskSnapshotRow[];
  snapshotLimit?: number;
  warn?: (message: string) => void;
};

export async function scanNegRiskCombinedArbs(
  options: {
    limit?: number;
    maxSnapshotStalenessMs?: number;
    minSnapshotEdge?: number;
    threshold?: number;
    warn?: (message: string) => void;
  } = {},
): Promise<NegRiskBracketOpportunity[]> {
  const [snapshotOpportunities, gammaOpportunities] = await Promise.all([
    Promise.resolve(
      scanNegRiskSnapshotBasketOpportunities({
        maxSnapshotStalenessMs: options.maxSnapshotStalenessMs,
        minEdge: options.minSnapshotEdge,
        warn: options.warn,
      }),
    ),
    scanNegRiskBracketArbs({
      limit: options.limit,
      threshold: options.threshold,
      warn: options.warn,
    }),
  ]);

  return dedupeNegRiskOpportunities([
    ...gammaOpportunities,
    ...snapshotOpportunities,
  ]);
}

export function scanNegRiskSnapshotBasketOpportunities(
  options: ScanNegRiskSnapshotOptions = {},
): NegRiskBracketOpportunity[] {
  const rows =
    options.rows ??
    loadRecentNegRiskSnapshotRows(
      options.snapshotLimit ?? DEFAULT_NEG_RISK_SNAPSHOT_LIMIT,
    );

  return scanNegRiskSnapshotRows(rows, options);
}

export function scanNegRiskSnapshotRows(
  rows: NegRiskSnapshotRow[],
  options: ScanNegRiskSnapshotOptions = {},
): NegRiskBracketOpportunity[] {
  const warn = options.warn ?? console.warn;
  const minEdge = options.minEdge ?? DEFAULT_NEG_RISK_SNAPSHOT_MIN_EDGE;
  const maxLegs = options.maxLegs ?? DEFAULT_NEG_RISK_SNAPSHOT_MAX_LEGS;
  const maxSnapshotStalenessMs =
    options.maxSnapshotStalenessMs ??
    DEFAULT_NEG_RISK_SNAPSHOT_MAX_STALENESS_MS;
  const latestByEventMarket = new Map<string, NegRiskSnapshotRow>();

  for (const row of rows) {
    const eventSlug = row.eventSlug?.trim();
    const marketKey = row.marketId?.trim() || row.marketSlug?.trim();

    if (
      !eventSlug ||
      !marketKey ||
      row.side !== "NO" ||
      !isPlausibleAsk(row.bestAsk) ||
      !row.tokenId.trim()
    ) {
      continue;
    }

    const key = `${eventSlug}\u0000${marketKey}`;
    const current = latestByEventMarket.get(key);

    if (!current || row.capturedAt > current.capturedAt) {
      latestByEventMarket.set(key, mergeSnapshotTiming(row, current));
    } else if (!current.expectedResolutionAt && row.expectedResolutionAt) {
      latestByEventMarket.set(key, mergeSnapshotTiming(current, row));
    }
  }

  const byEvent = new Map<string, NegRiskSnapshotRow[]>();

  for (const row of latestByEventMarket.values()) {
    const eventSlug = row.eventSlug;

    if (!eventSlug) {
      continue;
    }

    const group = byEvent.get(eventSlug) ?? [];

    group.push(row);
    byEvent.set(eventSlug, group);
  }

  const opportunities: NegRiskBracketOpportunity[] = [];

  for (const [eventSlug, group] of byEvent.entries()) {
    if (group.length < 3) {
      continue;
    }

    if (group.length > maxLegs) {
      warn(
        `Skipping snapshot NEG_RISK event "${eventSlug}": too many legs (${group.length}).`,
      );
      continue;
    }

    const capturedAtDeltaMs =
      Math.max(...group.map((row) => row.capturedAt)) -
      Math.min(...group.map((row) => row.capturedAt));

    if (capturedAtDeltaMs > maxSnapshotStalenessMs) {
      warn(
        `Skipping snapshot NEG_RISK event "${eventSlug}": stale leg snapshots.`,
      );
      continue;
    }

    const executableSum = roundPrice(
      group.reduce((sum, row) => sum + (row.bestAsk ?? 0), 0),
    );
    const threshold = group.length - 1;
    const expectedEdge = roundPrice(threshold - executableSum);
    const expectedResolutionAt = latestKnownResolutionAt(
      group.map((row) => row.expectedResolutionAt),
    );

    if (expectedEdge <= minEdge) {
      continue;
    }

    opportunities.push({
      eventSlug,
      sumYes: null,
      threshold,
      expectedEdge,
      ...(expectedResolutionAt ? { expectedResolutionAt } : {}),
      reason: NEG_RISK_SNAPSHOT_REASON,
      legs: group
        .sort((left, right) =>
          (left.marketSlug ?? left.marketId ?? left.tokenId).localeCompare(
            right.marketSlug ?? right.marketId ?? right.tokenId,
          ),
        )
        .map((row) => ({
          marketId: row.marketId ?? row.marketSlug ?? row.tokenId,
          slug: row.marketSlug ?? row.marketId ?? eventSlug,
          question: row.marketSlug ?? row.marketId ?? eventSlug,
          yesTokenId: null,
          noTokenId: row.tokenId,
          yesPrice: null,
          sideToPaperTrade: "NO",
        })),
    });
  }

  return opportunities.sort(
    (left, right) =>
      right.expectedEdge - left.expectedEdge ||
      left.eventSlug.localeCompare(right.eventSlug),
  );
}

function loadRecentNegRiskSnapshotRows(limit: number): NegRiskSnapshotRow[] {
  type SnapshotRow = {
    token_id: string;
    market_slug: string | null;
    event_slug: string | null;
    market_id: string | null;
    side: "YES" | "NO" | null;
    best_ask: number | null;
    expected_resolution_at: number | null;
    captured_at: number;
  };

  return getDb()
    .prepare<SnapshotRow>(
      `
      SELECT
        token_id,
        market_slug,
        event_slug,
        market_id,
        side,
        best_ask,
        ${selectExpectedResolutionColumn()},
        captured_at
      FROM orderbook_snapshots
      WHERE event_slug IS NOT NULL
        AND side = 'NO'
      ORDER BY captured_at DESC
      LIMIT ?
      `,
    )
    .all(limit)
    .map((row) => ({
      tokenId: row.token_id,
      marketSlug: row.market_slug,
      eventSlug: row.event_slug,
      marketId: row.market_id,
      side: row.side,
      bestAsk: row.best_ask,
      expectedResolutionAt: row.expected_resolution_at,
      capturedAt: row.captured_at,
    }));
}

function selectExpectedResolutionColumn(): string {
  const hasColumn = getDb()
    .prepare<{ name: string }>("PRAGMA table_info(orderbook_snapshots)")
    .all()
    .some((column) => column.name === "expected_resolution_at");

  return hasColumn
    ? "expected_resolution_at"
    : "NULL AS expected_resolution_at";
}

function dedupeNegRiskOpportunities(
  opportunities: NegRiskBracketOpportunity[],
): NegRiskBracketOpportunity[] {
  const seen = new Set<string>();
  const deduped: NegRiskBracketOpportunity[] = [];

  for (const opportunity of opportunities) {
    const key = [
      opportunity.eventSlug,
      ...opportunity.legs.map((leg) => leg.noTokenId).sort(),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(opportunity);
  }

  return deduped;
}

function isPlausibleAsk(value: number | null): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 1
  );
}

function mergeSnapshotTiming(
  latest: NegRiskSnapshotRow,
  fallback: NegRiskSnapshotRow | undefined,
): NegRiskSnapshotRow {
  return latest.expectedResolutionAt || !fallback?.expectedResolutionAt
    ? latest
    : {
        ...latest,
        expectedResolutionAt: fallback.expectedResolutionAt,
      };
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
