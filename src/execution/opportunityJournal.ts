import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db.js";

export type OpportunityStatus =
  | "raw_found"
  | "validated"
  | "rejected"
  | "paper_fired";

export type RecordOpportunityInput = {
  strategy: string;
  slug?: string;
  rawEdge?: number | null;
  executableEdge?: number | null;
  status?: OpportunityStatus;
  reason?: string | null;
  tokenIds?: string[];
  timestamp?: number;
};

export type UpdateOpportunityInput = {
  status: OpportunityStatus;
  executableEdge?: number | null;
  reason?: string | null;
};

export type OpportunityRecord = {
  id: string;
  strategy: string;
  slug: string | null;
  rawEdge: number | null;
  executableEdge: number | null;
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
        reason = @reason
      WHERE id = @id
      `
    )
    .run({
      id,
      status: input.status,
      executableEdge: input.executableEdge ?? null,
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
