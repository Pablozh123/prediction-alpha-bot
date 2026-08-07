import { getDb } from "./db.js";
import { v4 as uuidv4 } from "uuid";

export type PaperFireDedupeInput = {
  strategy: string;
  eventSlug: string;
  threshold: number;
  tokenIds: string[];
};

export type PaperFireRecordInput = {
  dedupeKey: string;
  strategy: string;
  eventSlug: string;
  firedAt: number;
};

export type PaperFireDedupeRow = {
  dedupe_key: string;
  strategy: string;
  event_slug: string;
  fired_at: number;
};

export type PaperDedupeSkipInput = {
  dedupeKey: string;
  strategy: string;
  slug?: string | null;
  threshold?: number | null;
  tokenIds: string[];
  previousFireAt: number;
  skippedAt: number;
  cooldownMs: number;
};

export type PaperDedupeSkipRecord = {
  id: string;
  dedupeKey: string;
  strategy: string;
  slug: string | null;
  threshold: number | null;
  tokenIds: string[];
  previousFireAt: number;
  skippedAt: number;
  cooldownMs: number;
};

type PaperDedupeSkipRow = {
  id: string;
  dedupe_key: string;
  strategy: string;
  slug: string | null;
  threshold: number | null;
  token_ids: string;
  previous_fire_at: number;
  skipped_at: number;
  cooldown_ms: number;
};

export function buildPaperFireDedupeKey(
  input: PaperFireDedupeInput
): string {
  const tokenPart = [...input.tokenIds].sort().join(",");

  return [
    `strategy=${input.strategy}`,
    `eventSlug=${input.eventSlug}`,
    `threshold=${input.threshold}`,
    `tokenIds=${tokenPart}`
  ].join("|");
}

export function hasRecentPaperFire(
  dedupeKey: string,
  nowMs: number,
  cooldownMs: number
): boolean {
  return getRecentPaperFire(dedupeKey, nowMs, cooldownMs) !== null;
}

export function getRecentPaperFire(
  dedupeKey: string,
  nowMs: number,
  cooldownMs: number
): PaperFireDedupeRow | null {
  const row = getDb()
    .prepare<PaperFireDedupeRow>(
      `
      SELECT dedupe_key, strategy, event_slug, fired_at
      FROM paper_fire_dedup
      WHERE dedupe_key = ?
      `
    )
    .get(dedupeKey);

  if (!row) {
    return null;
  }

  return nowMs - row.fired_at < cooldownMs ? row : null;
}

export function recordPaperFire(input: PaperFireRecordInput): void {
  getDb()
    .prepare(
      `
      INSERT INTO paper_fire_dedup (
        dedupe_key,
        strategy,
        event_slug,
        fired_at
      ) VALUES (
        @dedupeKey,
        @strategy,
        @eventSlug,
        @firedAt
      )
      ON CONFLICT(dedupe_key) DO UPDATE SET
        strategy = excluded.strategy,
        event_slug = excluded.event_slug,
        fired_at = excluded.fired_at
      `
    )
    .run(input);
}

export function recordPaperDedupeSkip(
  input: PaperDedupeSkipInput
): PaperDedupeSkipRecord {
  const record: PaperDedupeSkipRecord = {
    id: uuidv4(),
    dedupeKey: input.dedupeKey,
    strategy: input.strategy,
    slug: input.slug ?? null,
    threshold: input.threshold ?? null,
    tokenIds: input.tokenIds,
    previousFireAt: input.previousFireAt,
    skippedAt: input.skippedAt,
    cooldownMs: input.cooldownMs
  };

  getDb()
    .prepare(
      `
      INSERT INTO paper_dedupe_skips (
        id,
        dedupe_key,
        strategy,
        slug,
        threshold,
        token_ids,
        previous_fire_at,
        skipped_at,
        cooldown_ms
      ) VALUES (
        @id,
        @dedupeKey,
        @strategy,
        @slug,
        @threshold,
        @tokenIds,
        @previousFireAt,
        @skippedAt,
        @cooldownMs
      )
      `
    )
    .run({
      ...record,
      tokenIds: JSON.stringify(record.tokenIds)
    });

  return record;
}

export function listRecentPaperDedupeSkips(
  limit: number
): PaperDedupeSkipRecord[] {
  return getDb()
    .prepare<PaperDedupeSkipRow>(
      `
      SELECT
        id,
        dedupe_key,
        strategy,
        slug,
        threshold,
        token_ids,
        previous_fire_at,
        skipped_at,
        cooldown_ms
      FROM paper_dedupe_skips
      ORDER BY skipped_at DESC
      LIMIT ?
      `
    )
    .all(limit)
    .map(mapPaperDedupeSkipRow);
}

function mapPaperDedupeSkipRow(row: PaperDedupeSkipRow): PaperDedupeSkipRecord {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    strategy: row.strategy,
    slug: row.slug,
    threshold: row.threshold,
    tokenIds: parseTokenIds(row.token_ids),
    previousFireAt: row.previous_fire_at,
    skippedAt: row.skipped_at,
    cooldownMs: row.cooldown_ms
  };
}

function parseTokenIds(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((tokenId): tokenId is string => typeof tokenId === "string")
      : [];
  } catch {
    return [];
  }
}
