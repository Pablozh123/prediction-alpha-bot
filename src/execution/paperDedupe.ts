import { getDb } from "./db.js";

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

type PaperFireDedupeRow = {
  dedupe_key: string;
  strategy: string;
  event_slug: string;
  fired_at: number;
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
    return false;
  }

  return nowMs - row.fired_at < cooldownMs;
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
