import { getDb } from "./db.js";
import type { RuleReviewStatus, RuleScreenStatus } from "../core/taxonomy.js";

/**
 * One row per cross-venue pair the scanner has looked at, upserted every
 * cycle. The opportunities table records outcomes; this table records the
 * pair itself: both titles, both resolution times, what the automated screen
 * noticed, what a person decided, and excerpts of both rulebooks. The
 * published feed's `pairs` block is read from here, so a pair whose economics
 * were rejected at gate 1 still shows its numbers as information.
 */

export const RULES_EXCERPT_MAX_CHARS = 600;

export type CrossVenuePairReviewRecord = {
  verdict: RuleReviewStatus;
  date?: string;
  reviewer?: string;
  note?: string;
  checklist?: Record<string, boolean | string>;
  source?: string;
};

export type UpsertCrossVenuePairInput = {
  pairId: string;
  title?: string | null;
  kalshiTicker: string;
  polymarketSlug: string;
  kalshiTitle?: string | null;
  polymarketQuestion?: string | null;
  category?: string | null;
  source: "config" | "discovery";
  resolutionAtKalshi?: number | null;
  resolutionAtPolymarket?: number | null;
  ruleScreen?: RuleScreenStatus | null;
  ruleScreenDetail?: string | null;
  ruleReview?: RuleReviewStatus | null;
  review?: CrossVenuePairReviewRecord | null;
  kalshiRulesExcerpt?: string | null;
  polymarketRulesExcerpt?: string | null;
  lastGrossCents?: number | null;
  lastNetCents?: number | null;
  lastAnnualizedPct?: number | null;
  lastExecutableSize?: number | null;
  lastStatus?: string | null;
  timestamp?: number;
};

export type CrossVenuePairRecord = {
  pairId: string;
  title: string | null;
  kalshiTicker: string;
  polymarketSlug: string;
  kalshiTitle: string | null;
  polymarketQuestion: string | null;
  category: string | null;
  source: string;
  resolutionAtKalshi: number | null;
  resolutionAtPolymarket: number | null;
  ruleScreen: RuleScreenStatus | null;
  ruleScreenDetail: string | null;
  ruleReview: RuleReviewStatus | null;
  review: CrossVenuePairReviewRecord | null;
  kalshiRulesExcerpt: string | null;
  polymarketRulesExcerpt: string | null;
  lastGrossCents: number | null;
  lastNetCents: number | null;
  lastAnnualizedPct: number | null;
  lastExecutableSize: number | null;
  lastStatus: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

type Row = {
  pair_id: string;
  title: string | null;
  kalshi_ticker: string;
  polymarket_slug: string;
  kalshi_title: string | null;
  polymarket_question: string | null;
  category: string | null;
  source: string;
  resolution_at_kalshi: number | null;
  resolution_at_polymarket: number | null;
  rule_screen: RuleScreenStatus | null;
  rule_screen_detail: string | null;
  rule_review: RuleReviewStatus | null;
  review_json: string | null;
  kalshi_rules_excerpt: string | null;
  polymarket_rules_excerpt: string | null;
  last_gross_cents: number | null;
  last_net_cents: number | null;
  last_annualized_pct: number | null;
  last_executable_size: number | null;
  last_status: string | null;
  first_seen_at: number;
  last_seen_at: number;
};

export function excerptRules(text: string | null | undefined): string | null {
  const compact = (text ?? "").replace(/\s+/gu, " ").trim();

  if (!compact) {
    return null;
  }

  return compact.length > RULES_EXCERPT_MAX_CHARS
    ? `${compact.slice(0, RULES_EXCERPT_MAX_CHARS - 1)}…`
    : compact;
}

export function upsertCrossVenuePair(input: UpsertCrossVenuePairInput): void {
  const nowMs = input.timestamp ?? Date.now();
  const params = {
    pairId: input.pairId,
    title: input.title ?? null,
    kalshiTicker: input.kalshiTicker,
    polymarketSlug: input.polymarketSlug,
    kalshiTitle: input.kalshiTitle ?? null,
    polymarketQuestion: input.polymarketQuestion ?? null,
    category: input.category ?? null,
    source: input.source,
    resolutionAtKalshi: input.resolutionAtKalshi ?? null,
    resolutionAtPolymarket: input.resolutionAtPolymarket ?? null,
    ruleScreen: input.ruleScreen ?? null,
    ruleScreenDetail: input.ruleScreenDetail ?? null,
    ruleReview: input.ruleReview ?? input.review?.verdict ?? null,
    reviewJson: input.review ? JSON.stringify(input.review) : null,
    kalshiRulesExcerpt: excerptRules(input.kalshiRulesExcerpt),
    polymarketRulesExcerpt: excerptRules(input.polymarketRulesExcerpt),
    lastGrossCents: input.lastGrossCents ?? null,
    lastNetCents: input.lastNetCents ?? null,
    lastAnnualizedPct: input.lastAnnualizedPct ?? null,
    lastExecutableSize: input.lastExecutableSize ?? null,
    lastStatus: input.lastStatus ?? null,
    nowMs,
  };

  getDb()
    .prepare(
      `
      INSERT INTO cross_venue_pairs (
        pair_id, title, kalshi_ticker, polymarket_slug, kalshi_title,
        polymarket_question, category, source, resolution_at_kalshi,
        resolution_at_polymarket, rule_screen, rule_screen_detail, rule_review,
        review_json, kalshi_rules_excerpt, polymarket_rules_excerpt,
        last_gross_cents, last_net_cents, last_annualized_pct,
        last_executable_size, last_status, first_seen_at, last_seen_at
      ) VALUES (
        @pairId, @title, @kalshiTicker, @polymarketSlug, @kalshiTitle,
        @polymarketQuestion, @category, @source, @resolutionAtKalshi,
        @resolutionAtPolymarket, @ruleScreen, @ruleScreenDetail, @ruleReview,
        @reviewJson, @kalshiRulesExcerpt, @polymarketRulesExcerpt,
        @lastGrossCents, @lastNetCents, @lastAnnualizedPct,
        @lastExecutableSize, @lastStatus, @nowMs, @nowMs
      )
      ON CONFLICT(pair_id) DO UPDATE SET
        title = COALESCE(excluded.title, cross_venue_pairs.title),
        kalshi_title = COALESCE(excluded.kalshi_title, cross_venue_pairs.kalshi_title),
        polymarket_question = COALESCE(excluded.polymarket_question, cross_venue_pairs.polymarket_question),
        category = COALESCE(excluded.category, cross_venue_pairs.category),
        source = excluded.source,
        resolution_at_kalshi = COALESCE(excluded.resolution_at_kalshi, cross_venue_pairs.resolution_at_kalshi),
        resolution_at_polymarket = COALESCE(excluded.resolution_at_polymarket, cross_venue_pairs.resolution_at_polymarket),
        rule_screen = COALESCE(excluded.rule_screen, cross_venue_pairs.rule_screen),
        rule_screen_detail = COALESCE(excluded.rule_screen_detail, cross_venue_pairs.rule_screen_detail),
        rule_review = COALESCE(excluded.rule_review, cross_venue_pairs.rule_review),
        review_json = COALESCE(excluded.review_json, cross_venue_pairs.review_json),
        kalshi_rules_excerpt = COALESCE(excluded.kalshi_rules_excerpt, cross_venue_pairs.kalshi_rules_excerpt),
        polymarket_rules_excerpt = COALESCE(excluded.polymarket_rules_excerpt, cross_venue_pairs.polymarket_rules_excerpt),
        last_gross_cents = COALESCE(excluded.last_gross_cents, cross_venue_pairs.last_gross_cents),
        last_net_cents = COALESCE(excluded.last_net_cents, cross_venue_pairs.last_net_cents),
        last_annualized_pct = COALESCE(excluded.last_annualized_pct, cross_venue_pairs.last_annualized_pct),
        last_executable_size = COALESCE(excluded.last_executable_size, cross_venue_pairs.last_executable_size),
        last_status = COALESCE(excluded.last_status, cross_venue_pairs.last_status),
        last_seen_at = excluded.last_seen_at
      `,
    )
    .run(params);
}

export function listCrossVenuePairsSince(sinceMs: number, limit: number): CrossVenuePairRecord[] {
  return getDb()
    .prepare<Row>(
      `
      SELECT *
      FROM cross_venue_pairs
      WHERE last_seen_at >= ?
      ORDER BY last_seen_at DESC, pair_id ASC
      LIMIT ?
      `,
    )
    .all(sinceMs, limit)
    .map(mapRow);
}

export function getCrossVenuePair(pairId: string): CrossVenuePairRecord | null {
  const row = getDb()
    .prepare<Row>("SELECT * FROM cross_venue_pairs WHERE pair_id = ?")
    .get(pairId);

  return row ? mapRow(row) : null;
}

function mapRow(row: Row): CrossVenuePairRecord {
  return {
    pairId: row.pair_id,
    title: row.title,
    kalshiTicker: row.kalshi_ticker,
    polymarketSlug: row.polymarket_slug,
    kalshiTitle: row.kalshi_title,
    polymarketQuestion: row.polymarket_question,
    category: row.category,
    source: row.source,
    resolutionAtKalshi: row.resolution_at_kalshi,
    resolutionAtPolymarket: row.resolution_at_polymarket,
    ruleScreen: row.rule_screen,
    ruleScreenDetail: row.rule_screen_detail,
    ruleReview: row.rule_review,
    review: parseReview(row.review_json),
    kalshiRulesExcerpt: row.kalshi_rules_excerpt,
    polymarketRulesExcerpt: row.polymarket_rules_excerpt,
    lastGrossCents: row.last_gross_cents,
    lastNetCents: row.last_net_cents,
    lastAnnualizedPct: row.last_annualized_pct,
    lastExecutableSize: row.last_executable_size,
    lastStatus: row.last_status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

function parseReview(value: string | null): CrossVenuePairReviewRecord | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return parsed && typeof parsed === "object" && "verdict" in parsed
      ? (parsed as CrossVenuePairReviewRecord)
      : null;
  } catch {
    return null;
  }
}
