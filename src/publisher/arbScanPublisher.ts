import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_MIN_ANNUALIZED_NET_PCT,
  meetsAnnualizedHurdle,
} from "../core/opportunityEconomics.js";
import {
  gateForReason,
  normalizeRejectionReason,
  REJECTION_REASON_LABELS,
  REJECTION_REASONS,
  type RejectionReason,
} from "../core/rejectionReasons.js";
import {
  CAPITAL_LOCK_LABELS,
  CLASS_DEFINITIONS,
  classForStrategy,
  GATE_LABELS,
  isHedged,
  isRuleReviewStatus,
  isRuleScreenStatus,
  isStructuralClass,
  legacyRuleMatch,
  OPPORTUNITY_CLASSES,
  RULE_REVIEW_LABELS,
  RULE_REVIEW_STATUSES,
  RULE_SCREEN_LABELS,
  RULE_SCREEN_STATUSES,
  ruleScreenFromRejection,
  type OpportunityClass,
  type RuleReviewStatus,
  type RuleScreenStatus,
} from "../core/taxonomy.js";
import { FEE_MODEL_VERSION } from "../core/venueFees.js";
import { listCrossVenuePairsSince } from "../execution/crossVenuePairJournal.js";
import { getDb } from "../execution/db.js";
import {
  countOpportunitiesByStatusSince,
  countRejectionReasonsSince,
  getOpportunityById,
  listLatestOpportunitiesByKey,
  type OpportunityWindowRow,
} from "../execution/opportunityJournal.js";
import { listOpportunityLegs } from "../execution/opportunityLegJournal.js";
import {
  listRecentPaperTrades,
  summarizePaperTrades,
} from "../execution/tradeJournal.js";
import {
  DEFAULT_MAX_SHORT_DURATION_HOURS,
  DEFAULT_MEDIUM_DURATION_HOURS,
} from "../utils/marketTime.js";

/**
 * Publishes the scanner's state as one JSON file for the website.
 *
 * Every field is read from the SQLite journals, never from in-process
 * counters, so the file says what was written down, not what the process
 * believes. The write is atomic (temp file in the target directory, then
 * rename) and validated against the schema below before it leaves the process;
 * a snapshot that fails validation is logged and not written, because a
 * half-right feed is worse than a stale one.
 *
 * Schema `arb_scan/2` (2026-09-05, docs/ARB_TAXONOMY.md) is a superset of
 * `arb_scan/1`: every first-schema key keeps its meaning, and the taxonomy
 * arrives in new blocks. `vocabulary` carries every label the website
 * shows, `config` the thresholds the numbers were judged against, `chances`
 * only rows that clear the decision rule, `carry_candidates` the clean but
 * not fireable ones, `rejected_examples` a few rows per reason, and `pairs`
 * the cross-venue pair board with both rulebooks' excerpts and the review.
 *
 * The file is also the heartbeat: `health.last_cycle_at` and `cycles_24h`
 * come from the scan_cycles table, and `alive` is false as soon as the last
 * cycle is older than three intervals (floor: ten minutes). Silence is the
 * failure mode this project fears most; the file makes silence visible.
 */

export const ARB_SCAN_SCHEMA = "arb_scan/2";
export const ARB_SCAN_FILENAME = "arb_scan.json";
export const ARB_SCAN_DISCLAIMER = "Paper-only research. Not trading advice.";
export const DEFAULT_PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_PUBLISHED_OPPORTUNITIES = 50;
export const MAX_PUBLISHED_PAPER_POSITIONS = 50;
export const MAX_ROWS_PER_CLASS = 20;
export const MAX_REJECTED_EXAMPLES_PER_REASON = 5;
export const MAX_PUBLISHED_PAIRS = 60;
/** Rows every strategy is guaranteed in the first-schema list, if it has any. */
export const MIN_ROWS_PER_STRATEGY = 5;
/**
 * `alive` tolerates the longer of three scan intervals or ten minutes. A cycle
 * that walks hundreds of books can take over a minute and its timestamp is the
 * cycle start, so a tighter floor would flag a healthy scanner as dead.
 */
export const STALE_FLOOR_MS = 600_000;
/** How many recent cycles decide the effective cadence. */
const CADENCE_SAMPLE_CYCLES = 200;

export const STRATEGY_LABELS: Readonly<Record<string, string>> = {
  neg_risk_bracket_arb: "NEG_RISK bracket sum-arb (Polymarket)",
  within_market_fast_arb: "Within-market YES+NO (Polymarket)",
  within_market_yes_no_arb: "Within-market YES+NO, slow lane (Polymarket)",
  clear_win_watch: "Clear-win watch (diagnostic only)",
  cross_venue_yes_no_arb: "Cross-venue YES/NO (Kalshi x Polymarket)",
};

const ALWAYS_LISTED_STRATEGIES = [
  "neg_risk_bracket_arb",
  "within_market_fast_arb",
  "clear_win_watch",
  "cross_venue_yes_no_arb",
] as const;

export type ArbScanPublishConfig = {
  hurdlePct: number;
  targetSizeUsd: number;
  minExecutableDepthUsd: number;
  cleanBasketMinEdgeBps: number;
  crossVenueMinNetCents: number;
  shortMaxHours: number;
  mediumMaxDays: number;
  executionRoleMode: string;
};

export const DEFAULT_PUBLISH_CONFIG: ArbScanPublishConfig = {
  hurdlePct: DEFAULT_MIN_ANNUALIZED_NET_PCT,
  targetSizeUsd: 20,
  minExecutableDepthUsd: 5,
  cleanBasketMinEdgeBps: 100,
  crossVenueMinNetCents: 0.5,
  shortMaxHours: DEFAULT_MAX_SHORT_DURATION_HOURS,
  mediumMaxDays: DEFAULT_MEDIUM_DURATION_HOURS / 24,
  executionRoleMode: "taker",
};

const isoString = z.string().datetime({ offset: true });
const nonNegativeInt = z.number().int().nonnegative();
const nullableNumber = z.number().nullable();
const opportunityClass = z.enum(OPPORTUNITY_CLASSES);
const capitalLockClass = z.enum(["short", "medium", "long", "unknown"]);
const ruleScreen = z.enum(RULE_SCREEN_STATUSES);
const ruleReview = z.enum(RULE_REVIEW_STATUSES);
const gate = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const arbScanLegSchema = z.object({
  venue: z.string().min(1),
  side: z.enum(["YES", "NO"]),
  price: z.number(),
  size_usd: z.number(),
  role: z.enum(["maker", "taker"]),
  fee_usd: z.number(),
});

export const arbScanOpportunitySchema = z.object({
  id: z.string().min(1),
  strategy: z.string().min(1),
  class: opportunityClass.nullable(),
  venues: z.array(z.string().min(1)),
  title: z.string(),
  market_ref: z.string(),
  legs: z.array(arbScanLegSchema),
  gross_edge_bps: nullableNumber,
  executable_net_edge_bps: nullableNumber,
  net_profit_usd: nullableNumber,
  depth_usd: z.number(),
  capital_usd: z.number(),
  days_to_resolution: nullableNumber,
  annualized_pct: nullableNumber,
  hurdle_met: z.boolean().nullable(),
  capital_lock_class: capitalLockClass.nullable(),
  resolution_at_by_venue: z.object({
    kalshi: isoString.nullable(),
    polymarket: isoString.nullable(),
  }),
  status: z.enum(["validated", "candidate", "rejected"]),
  rejection_reason: z.string().nullable(),
  gate_failed: gate.nullable(),
  rule_match: z.enum(["unverified", "reviewed", "mismatch"]),
  rule_screen: ruleScreen.nullable(),
  rule_review: ruleReview.nullable(),
  first_seen_at: isoString,
  last_seen_at: isoString,
  open_seconds: nonNegativeInt,
});

export const arbScanPaperPositionSchema = z.object({
  trade_id: z.string().min(1),
  opportunity_id: z.string().nullable(),
  strategy: z.string().min(1),
  title: z.string(),
  opened_at: isoString,
  capital_usd: z.number(),
  expected_edge_bps: z.number().nullable(),
  status: z.enum(["open", "resolved"]),
  pnl_usd: z.number().nullable(),
  /** Why a resolved row has its figure, or has none (e.g. filled_after_close). */
  resolution_reason: z.string().nullable(),
});

export const arbScanPairSchema = z.object({
  pair_id: z.string().min(1),
  title: z.string(),
  category: z.string().nullable(),
  source: z.enum(["config", "discovery"]),
  kalshi: z.object({
    ticker: z.string().min(1),
    title: z.string().nullable(),
    resolution_at: isoString.nullable(),
    rules_excerpt: z.string().nullable(),
  }),
  polymarket: z.object({
    slug: z.string().min(1),
    question: z.string().nullable(),
    resolution_at: isoString.nullable(),
    rules_excerpt: z.string().nullable(),
  }),
  resolution_gap_days: nullableNumber,
  rule_screen: ruleScreen.nullable(),
  rule_screen_detail: z.string().nullable(),
  rule_review: ruleReview,
  review: z
    .object({
      verdict: ruleReview,
      date: z.string().nullable(),
      reviewer: z.string().nullable(),
      note: z.string().nullable(),
      checklist: z.record(z.string(), z.union([z.boolean(), z.string()])).nullable(),
      source: z.string().nullable(),
    })
    .nullable(),
  hedged: z.boolean(),
  last: z.object({
    gross_cents: nullableNumber,
    net_cents: nullableNumber,
    annualized_pct: nullableNumber,
    executable_size: nullableNumber,
    status: z.string().nullable(),
  }),
  first_seen_at: isoString,
  last_seen_at: isoString,
});

const vocabularyEntry = z.object({ id: z.string().min(1), label: z.string().min(1) });

export const arbScanVocabularySchema = z.object({
  classes: z.array(
    z.object({
      id: opportunityClass,
      label: z.string().min(1),
      basket: z.string(),
      payout: z.string(),
      structural_when: z.string().nullable(),
      main_risk: z.string(),
      scanned: z.boolean(),
    }),
  ),
  strategies: z.array(
    z.object({ id: z.string().min(1), label: z.string().min(1), class: opportunityClass.nullable() }),
  ),
  capital_lock: z.array(vocabularyEntry),
  rule_screen: z.array(vocabularyEntry),
  rule_review: z.array(vocabularyEntry),
  gates: z.array(z.object({ gate, label: z.string().min(1) })),
  rejection_reasons: z.array(
    z.object({ id: z.string().min(1), label: z.string().min(1), gate: gate.nullable() }),
  ),
});

export const arbScanSchema = z.object({
  schema: z.literal(ARB_SCAN_SCHEMA),
  generated_at: isoString,
  generator: z.object({
    repo: z.literal("prediction-alpha-bot"),
    git_sha: z.string().min(1),
    mode: z.literal("paper"),
  }),
  disclaimer: z.literal(ARB_SCAN_DISCLAIMER),
  health: z.object({
    last_cycle_at: isoString.nullable(),
    cycles_24h: nonNegativeInt,
    errors_24h: nonNegativeInt,
    /** Effective cadence: the configured interval or the median cycle gap, whichever is longer. */
    scan_interval_ms: z.number().int().positive(),
    configured_interval_ms: z.number().int().positive(),
    alive: z.boolean(),
  }),
  config: z.object({
    hurdle_pct: z.number(),
    target_size_usd: z.number(),
    min_executable_depth_usd: z.number(),
    clean_basket_min_edge_bps: z.number(),
    cross_venue_min_net_cents: z.number(),
    short_max_hours: z.number(),
    medium_max_days: z.number(),
    execution_role_mode: z.string().min(1),
    fee_model_version: z.string().min(1),
  }),
  summary: z.object({
    raw_candidates_24h: nonNegativeInt,
    near_miss_24h: nonNegativeInt,
    validated_24h: nonNegativeInt,
    candidates_24h: nonNegativeInt,
    paper_fired_24h: nonNegativeInt,
    open_paper_positions: nonNegativeInt,
    resolved_paper_trades: nonNegativeInt,
    resolved_paper_pnl_usd: z.number().nullable(),
    sample_note: z.string(),
  }),
  strategies: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      class: opportunityClass.nullable(),
      raw_24h: nonNegativeInt,
      near_miss_24h: nonNegativeInt,
      validated_24h: nonNegativeInt,
      candidates_24h: nonNegativeInt,
      paper_24h: nonNegativeInt,
      top_rejection: z.string().nullable(),
    }),
  ),
  rejections_24h: z.array(
    z.object({
      reason: z.string().min(1),
      label: z.string().min(1),
      gate: gate.nullable(),
      count: nonNegativeInt,
    }),
  ),
  vocabulary: arbScanVocabularySchema,
  opportunities: z.array(arbScanOpportunitySchema).max(MAX_PUBLISHED_OPPORTUNITIES),
  chances: z.array(arbScanOpportunitySchema),
  carry_candidates: z.array(arbScanOpportunitySchema),
  rejected_examples: z.array(
    z.object({
      reason: z.string().min(1),
      label: z.string().min(1),
      gate: gate.nullable(),
      count_24h: nonNegativeInt,
      examples: z.array(arbScanOpportunitySchema).max(MAX_REJECTED_EXAMPLES_PER_REASON),
    }),
  ),
  pairs: z.array(arbScanPairSchema).max(MAX_PUBLISHED_PAIRS),
  paper_positions: z
    .array(arbScanPaperPositionSchema)
    .max(MAX_PUBLISHED_PAPER_POSITIONS),
});

export type ArbScanSnapshot = z.infer<typeof arbScanSchema>;
export type PublishedOpportunity = ArbScanSnapshot["opportunities"][number];

export type BuildArbScanSnapshotOptions = {
  nowMs?: number;
  scanIntervalMs: number;
  gitSha?: string;
  windowMs?: number;
  /** Extra note appended to the sample note, e.g. the measurement window. */
  sampleNote?: string;
  config?: Partial<ArbScanPublishConfig>;
};

/** Anything that looks like a local filesystem path or a user name. */
const FORBIDDEN_CONTENT_PATTERNS = [
  /[A-Za-z]:\\/u,
  /\\Users\\/u,
  /\/Users\//u,
  /\/home\/[a-z]/u,
];

export function resolveGitSha(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = (env.GIT_SHA ?? env.GITHUB_SHA ?? "").trim();

  if (fromEnv) {
    return fromEnv.slice(0, 12);
  }

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** The vocabulary block: every word the website may show, with its label. */
export function buildArbScanVocabulary(): ArbScanSnapshot["vocabulary"] {
  return {
    classes: CLASS_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      basket: definition.basket,
      payout: definition.payout,
      structural_when: definition.structuralWhen,
      main_risk: definition.mainRisk,
      scanned: definition.scanned,
    })),
    strategies: Object.entries(STRATEGY_LABELS).map(([id, label]) => ({
      id,
      label,
      class: classForStrategy(id),
    })),
    capital_lock: (["short", "medium", "long", "unknown"] as const).map((id) => ({
      id,
      label: CAPITAL_LOCK_LABELS[id],
    })),
    rule_screen: RULE_SCREEN_STATUSES.map((id) => ({ id, label: RULE_SCREEN_LABELS[id] })),
    rule_review: RULE_REVIEW_STATUSES.map((id) => ({ id, label: RULE_REVIEW_LABELS[id] })),
    gates: ([1, 2, 3, 4, 5] as const).map((id) => ({ gate: id, label: GATE_LABELS[id] })),
    rejection_reasons: REJECTION_REASONS.map((id) => ({
      id,
      label: REJECTION_REASON_LABELS[id],
      gate: gateForReason(id),
    })),
  };
}

export function buildArbScanSnapshot(
  options: BuildArbScanSnapshotOptions,
): ArbScanSnapshot {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_PUBLISH_WINDOW_MS;
  const sinceMs = nowMs - windowMs;
  const config: ArbScanPublishConfig = { ...DEFAULT_PUBLISH_CONFIG, ...options.config };
  const cycles = readScanCycleHealth(sinceMs);
  const runs = readScannerRunsByStrategy(sinceMs);
  const statusCounts = countOpportunitiesByStatusSince(sinceMs);
  const paper = summarizePaperTrades(sinceMs);
  const effectiveIntervalMs = Math.max(
    options.scanIntervalMs,
    readEffectiveCadenceMs(CADENCE_SAMPLE_CYCLES) ?? 0,
  );
  const staleAfterMs = Math.max(3 * effectiveIntervalMs, STALE_FLOOR_MS);
  const alive =
    cycles.lastCycleAt !== null && nowMs - cycles.lastCycleAt <= staleAfterMs;

  const strategyIds = new Set<string>([
    ...ALWAYS_LISTED_STRATEGIES,
    ...runs.keys(),
  ]);
  const strategies = [...strategyIds].map((id) => {
    const run = runs.get(id);
    const topRejection = countRejectionReasonsSince(sinceMs, id)[0];
    const statuses = countOpportunitiesByStatusSince(sinceMs, id);

    return {
      id,
      label: STRATEGY_LABELS[id] ?? id,
      class: classForStrategy(id),
      raw_24h: run?.raw ?? 0,
      near_miss_24h: run?.nearMiss ?? 0,
      validated_24h: run?.validated ?? 0,
      candidates_24h: Math.max(run?.candidates ?? 0, statuses.candidate),
      paper_24h: run?.paperTrades ?? 0,
      top_rejection: topRejection ? normalizeRejectionReason(topRejection.reason) : null,
    };
  });

  const rejections = aggregateRejections(sinceMs);
  const windowRows = listLatestOpportunitiesByKey(sinceMs, 500).map((row) =>
    toPublishedOpportunity(row, config.hurdlePct),
  );
  const opportunities = selectLegacyList(windowRows);
  const chances = perClass(windowRows.filter((row) => row.status === "validated"));
  const carryCandidates = perClass(windowRows.filter((row) => row.status === "candidate"));
  const rejectedExamples = buildRejectedExamples(windowRows, rejections);
  const pairs = listCrossVenuePairsSince(sinceMs, MAX_PUBLISHED_PAIRS)
    .map(toPublishedPair)
    .sort(comparePairs);
  const paperPositions = listRecentPaperTrades(MAX_PUBLISHED_PAPER_POSITIONS).map(
    (trade) => {
      const linked = trade.opportunityId ? getOpportunityById(trade.opportunityId) : null;
      const expectedEdgeBps =
        linked?.netEdgeBps ??
        (linked?.executableEdge !== null && linked?.executableEdge !== undefined
          ? round2(linked.executableEdge * 10_000)
          : null);

      return {
        trade_id: trade.id,
        opportunity_id: trade.opportunityId,
        strategy: trade.strategy,
        title: trade.question ?? trade.slug ?? "",
        opened_at: new Date(trade.timestamp).toISOString(),
        capital_usd: round4(trade.sizeUsd),
        expected_edge_bps: expectedEdgeBps,
        status: trade.resolved ? ("resolved" as const) : ("open" as const),
        pnl_usd: trade.resolved && !trade.inflationFlagged ? trade.pnl : null,
        resolution_reason: trade.resolved ? trade.resolutionReason : null,
      };
    },
  );

  const sampleNoteParts = [
    `${paper.resolvedLinked} resolved paper trade(s) with a linked candidate` +
      (paper.legacyUnlinked > 0
        ? `; ${paper.legacyUnlinked} legacy trade(s) without a candidate link are excluded from PnL`
        : ""),
    paper.resolvedLinked === 0
      ? "no PnL statement until the resolved sample exists"
      : "PnL is the sum over linked, resolved, unflagged trades only",
  ];

  if (options.sampleNote) {
    sampleNoteParts.push(options.sampleNote);
  }

  const snapshot: ArbScanSnapshot = {
    schema: ARB_SCAN_SCHEMA,
    generated_at: new Date(nowMs).toISOString(),
    generator: {
      repo: "prediction-alpha-bot",
      git_sha: options.gitSha ?? resolveGitSha(),
      mode: "paper",
    },
    disclaimer: ARB_SCAN_DISCLAIMER,
    health: {
      last_cycle_at:
        cycles.lastCycleAt === null ? null : new Date(cycles.lastCycleAt).toISOString(),
      cycles_24h: cycles.cycles,
      errors_24h: cycles.failedCycles + runs.errorCount,
      scan_interval_ms: effectiveIntervalMs,
      configured_interval_ms: options.scanIntervalMs,
      alive,
    },
    config: {
      hurdle_pct: config.hurdlePct,
      target_size_usd: config.targetSizeUsd,
      min_executable_depth_usd: config.minExecutableDepthUsd,
      clean_basket_min_edge_bps: config.cleanBasketMinEdgeBps,
      cross_venue_min_net_cents: config.crossVenueMinNetCents,
      short_max_hours: config.shortMaxHours,
      medium_max_days: config.mediumMaxDays,
      execution_role_mode: config.executionRoleMode,
      fee_model_version: FEE_MODEL_VERSION,
    },
    summary: {
      raw_candidates_24h: [...runs.values()].reduce((sum, run) => sum + run.raw, 0),
      near_miss_24h: [...runs.values()].reduce((sum, run) => sum + run.nearMiss, 0),
      validated_24h: statusCounts.validated + statusCounts.paper_fired,
      candidates_24h: statusCounts.candidate,
      paper_fired_24h: paper.firedSince,
      open_paper_positions: paper.open,
      // The n of the PnL figure next to it: resolved, linked to a candidate,
      // not flagged. Rows closed with a reason and no figure are not counted.
      resolved_paper_trades: paper.resolvedLinked,
      resolved_paper_pnl_usd: paper.resolvedPnlUsd,
      sample_note: sampleNoteParts.join(". ") + ".",
    },
    strategies,
    rejections_24h: rejections,
    vocabulary: buildArbScanVocabulary(),
    opportunities,
    chances,
    carry_candidates: carryCandidates,
    rejected_examples: rejectedExamples,
    pairs,
    paper_positions: paperPositions,
  };

  return arbScanSchema.parse(snapshot);
}

export type PublishArbScanResult =
  | { written: true; path: string; bytes: number }
  | { written: false; reason: string };

/**
 * Atomically write the snapshot as `arb_scan.json` into `dir`. Validation runs
 * first; content that carries a filesystem path or a user name is refused
 * because the file is public.
 */
export function publishArbScan(
  snapshot: ArbScanSnapshot,
  dir: string,
): PublishArbScanResult {
  const parsed = arbScanSchema.safeParse(snapshot);

  if (!parsed.success) {
    return {
      written: false,
      reason: `schema_invalid: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    };
  }

  const json = JSON.stringify(parsed.data, null, 2);

  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(json)) {
      return { written: false, reason: `forbidden_content: ${pattern.source}` };
    }
  }

  mkdirSync(dir, { recursive: true });

  const target = join(dir, ARB_SCAN_FILENAME);
  const temp = join(
    dir,
    `${ARB_SCAN_FILENAME}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );

  try {
    writeFileSync(temp, json, "utf8");
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }

  return { written: true, path: target, bytes: Buffer.byteLength(json, "utf8") };
}

export type ArbScanPublisher = {
  publish(reason: string): PublishArbScanResult;
  readonly lastPublishedAt: number | null;
  readonly enabled: boolean;
};

export function createArbScanPublisher(input: {
  dir: string | undefined;
  scanIntervalMs: number;
  logger: { info(message: string): void; warn(message: string): void; error(message: string): void };
  gitSha?: string;
  sampleNote?: string;
  config?: Partial<ArbScanPublishConfig>;
  now?: () => number;
}): ArbScanPublisher {
  const dir = input.dir?.trim();
  const now = input.now ?? Date.now;
  const gitSha = input.gitSha ?? resolveGitSha();
  let lastPublishedAt: number | null = null;

  if (!dir) {
    input.logger.info(
      "arb_scan publisher disabled: ARB_PUBLISH_DIR is not set; no feed file will be written.",
    );
  }

  return {
    get lastPublishedAt() {
      return lastPublishedAt;
    },
    get enabled() {
      return Boolean(dir);
    },
    publish(reason: string): PublishArbScanResult {
      if (!dir) {
        return { written: false, reason: "publish_dir_unset" };
      }

      try {
        const snapshot = buildArbScanSnapshot({
          nowMs: now(),
          scanIntervalMs: input.scanIntervalMs,
          gitSha,
          sampleNote: input.sampleNote,
          config: input.config,
        });
        const result = publishArbScan(snapshot, dir);

        if (result.written) {
          lastPublishedAt = now();
          input.logger.info(
            JSON.stringify({
              level: "info",
              event: "arb_scan_published",
              reason,
              bytes: result.bytes,
              opportunities: snapshot.opportunities.length,
              chances: snapshot.chances.length,
              carry_candidates: snapshot.carry_candidates.length,
              pairs: snapshot.pairs.length,
              cycles_24h: snapshot.health.cycles_24h,
              alive: snapshot.health.alive,
            }),
          );
        } else {
          input.logger.error(
            JSON.stringify({ level: "error", event: "arb_scan_publish_refused", reason: result.reason }),
          );
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        input.logger.error(
          JSON.stringify({ level: "error", event: "arb_scan_publish_failed", error: message }),
        );

        return { written: false, reason: message };
      }
    },
  };
}

function readScanCycleHealth(sinceMs: number): {
  cycles: number;
  failedCycles: number;
  lastCycleAt: number | null;
} {
  type Row = { cycles: number; failed: number; last_cycle_at: number | null };
  const row = getDb()
    .prepare<Row>(
      `
      SELECT
        SUM(CASE WHEN timestamp >= @sinceMs THEN 1 ELSE 0 END) AS cycles,
        SUM(CASE WHEN timestamp >= @sinceMs AND success = 0 THEN 1 ELSE 0 END) AS failed,
        MAX(timestamp) AS last_cycle_at
      FROM scan_cycles
      `,
    )
    .get({ sinceMs }) as Row | undefined;

  return {
    cycles: row?.cycles ?? 0,
    failedCycles: row?.failed ?? 0,
    lastCycleAt: row?.last_cycle_at ?? null,
  };
}

/**
 * The median gap between recent cycle starts. A cycle that walks hundreds of
 * books runs longer than the configured interval, so the interval alone
 * would flag a healthy scanner as dead; the feed reports the cadence the
 * scanner actually keeps.
 */
export function readEffectiveCadenceMs(sampleCycles: number): number | null {
  type Row = { timestamp: number };
  const timestamps = getDb()
    .prepare<Row>(
      "SELECT timestamp FROM scan_cycles ORDER BY timestamp DESC LIMIT ?",
    )
    .all(sampleCycles)
    .map((row) => row.timestamp)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (timestamps.length < 3) {
    return null;
  }

  const gaps: number[] = [];

  for (let index = 1; index < timestamps.length; index += 1) {
    const gap = (timestamps[index] ?? 0) - (timestamps[index - 1] ?? 0);

    if (gap > 0) {
      gaps.push(gap);
    }
  }

  if (gaps.length === 0) {
    return null;
  }

  gaps.sort((left, right) => left - right);

  return Math.round(gaps[Math.floor(gaps.length / 2)] ?? 0);
}

type StrategyRunAggregate = {
  raw: number;
  nearMiss: number;
  validated: number;
  candidates: number;
  paperTrades: number;
};

function readScannerRunsByStrategy(
  sinceMs: number,
): Map<string, StrategyRunAggregate> & { errorCount: number } {
  type Row = {
    strategy: string;
    raw: number;
    near_miss: number;
    validated: number;
    candidates: number;
    paper_trades: number;
    errors: number;
  };
  const rows = getDb()
    .prepare<Row>(
      `
      SELECT
        strategy,
        SUM(raw_opportunities) AS raw,
        SUM(near_miss_opportunities) AS near_miss,
        SUM(validated_opportunities) AS validated,
        SUM(candidate_opportunities) AS candidates,
        SUM(paper_trades) AS paper_trades,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors
      FROM scanner_runs
      WHERE timestamp >= ?
      GROUP BY strategy
      `,
    )
    .all(sinceMs);
  const map = new Map<string, StrategyRunAggregate>() as Map<string, StrategyRunAggregate> & {
    errorCount: number;
  };
  let errorCount = 0;

  for (const row of rows) {
    map.set(row.strategy, {
      raw: row.raw ?? 0,
      nearMiss: row.near_miss ?? 0,
      validated: row.validated ?? 0,
      candidates: row.candidates ?? 0,
      paperTrades: row.paper_trades ?? 0,
    });
    errorCount += row.errors ?? 0;
  }

  map.errorCount = errorCount;

  return map;
}

function aggregateRejections(
  sinceMs: number,
): ArbScanSnapshot["rejections_24h"] {
  const counts = new Map<RejectionReason, number>();

  for (const row of countRejectionReasonsSince(sinceMs)) {
    const reason = normalizeRejectionReason(row.reason);

    counts.set(reason, (counts.get(reason) ?? 0) + row.count);
  }

  const dedupeSkips =
    getDb()
      .prepare<{ count: number }>(
        "SELECT COUNT(*) AS count FROM paper_dedupe_skips WHERE skipped_at >= ?",
      )
      .get(sinceMs)?.count ?? 0;

  if (dedupeSkips > 0) {
    counts.set(
      "duplicate_within_cooldown",
      (counts.get("duplicate_within_cooldown") ?? 0) + dedupeSkips,
    );
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      label: REJECTION_REASON_LABELS[reason],
      gate: gateForReason(reason),
      count,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        REJECTION_REASONS.indexOf(left.reason) - REJECTION_REASONS.indexOf(right.reason),
    );
}

/**
 * A journal row as the website sees it. Rows that failed gate 1 carry no
 * return figures: the payout those figures assumed does not exist.
 */
export function toPublishedOpportunity(
  row: OpportunityWindowRow,
  hurdlePct: number,
): PublishedOpportunity {
  const legs = listOpportunityLegs(row.id);
  const status: PublishedOpportunity["status"] =
    row.status === "validated" || row.status === "paper_fired"
      ? "validated"
      : row.status === "candidate"
        ? "candidate"
        : "rejected";
  const rejectionReason = status === "rejected" ? normalizeRejectionReason(row.reason) : null;
  const gateFailed =
    status === "rejected" ? (row.gateFailed as 1 | 2 | 3 | 4 | 5 | null) ?? gateForReason(rejectionReason) : null;
  const structureFailed = gateFailed === 1;
  const opportunityClass = classForStrategy(row.strategy);
  const screen = resolveRuleScreen(row, opportunityClass, rejectionReason);
  const review = resolveRuleReview(row, opportunityClass);
  const grossEdgeBps = structureFailed
    ? null
    : round2(row.grossEdgeBps ?? (row.rawEdge !== null ? row.rawEdge * 10_000 : 0));
  const netEdgeBps = structureFailed
    ? null
    : round2(row.netEdgeBps ?? (row.executableEdge !== null ? row.executableEdge * 10_000 : 0));
  const annualizedPct = structureFailed ? null : row.annualizedPct;
  const netProfitUsd = structureFailed
    ? null
    : row.netProfitUsd ?? row.basketProfitUsd ?? null;

  return {
    id: row.id,
    strategy: row.strategy,
    class: opportunityClass,
    venues: row.venues.length > 0 ? row.venues : ["polymarket"],
    title: row.title ?? row.slug ?? "",
    market_ref: row.slug ?? "",
    legs: legs.map((leg) => ({
      venue: leg.venue ?? "polymarket",
      side: leg.side === "NO" ? ("NO" as const) : ("YES" as const),
      price: round6(leg.averageFillPrice ?? leg.bestAsk ?? 0),
      size_usd: round4(leg.sizeUsd ?? 0),
      role: leg.role === "maker" ? ("maker" as const) : ("taker" as const),
      fee_usd: round4(leg.feeUsd ?? 0),
    })),
    gross_edge_bps: grossEdgeBps,
    executable_net_edge_bps: netEdgeBps,
    net_profit_usd: netProfitUsd === null ? null : round4(netProfitUsd),
    depth_usd: round4(row.depthUsd ?? row.minLegDepthUsd ?? 0),
    capital_usd: round4(row.capitalUsd ?? row.basketCostUsd ?? 0),
    days_to_resolution: row.daysToResolution,
    annualized_pct: annualizedPct,
    hurdle_met: annualizedPct === null ? null : meetsAnnualizedHurdle(annualizedPct, hurdlePct),
    capital_lock_class: row.capitalLockClass,
    resolution_at_by_venue: {
      kalshi: toIso(row.resolutionAtKalshi),
      polymarket: toIso(
        row.resolutionAtPolymarket ??
          (opportunityClass !== "cross_venue_complement" ? row.expectedResolutionAt : null),
      ),
    },
    status,
    rejection_reason: rejectionReason,
    gate_failed: gateFailed,
    rule_match: legacyRuleMatch(screen, review),
    rule_screen: screen,
    rule_review: review,
    first_seen_at: new Date(row.firstSeenAt).toISOString(),
    last_seen_at: new Date(row.lastSeenAt).toISOString(),
    open_seconds: Math.max(0, Math.floor((row.lastSeenAt - row.firstSeenAt) / 1000)),
  };
}

/**
 * Rows written before 2026-09-05 carry no rule_screen. They are derived the
 * way the new scanner would write them: one contract is structural, a
 * cross-venue mismatch reason names its screen, and everything else passed
 * the automated screen or was never screened.
 */
function resolveRuleScreen(
  row: OpportunityWindowRow,
  opportunityClass: OpportunityClass | null,
  rejectionReason: RejectionReason | null,
): RuleScreenStatus | null {
  if (isRuleScreenStatus(row.ruleScreen)) {
    return row.ruleScreen;
  }

  if (opportunityClass === "same_market_complement") {
    return "structural";
  }

  const fromReason = ruleScreenFromRejection(rejectionReason);

  if (fromReason) {
    return fromReason;
  }

  if (opportunityClass === "neg_risk_no_basket") {
    return rejectionReason && gateForReason(rejectionReason) === 1 ? null : "passed";
  }

  if (opportunityClass === "cross_venue_complement") {
    return row.ruleMatch === "mismatch" ? "different_question" : "passed";
  }

  return null;
}

function resolveRuleReview(
  row: OpportunityWindowRow,
  opportunityClass: OpportunityClass | null,
): RuleReviewStatus | null {
  if (isRuleReviewStatus(row.ruleReview)) {
    return row.ruleReview;
  }

  if (opportunityClass !== "cross_venue_complement") {
    return null;
  }

  return row.ruleMatch === "reviewed" ? "equivalent" : "none";
}

/**
 * The first-schema list: validated first, then candidates, then rejections,
 * each ordered by dollar profit at the executable size. Every strategy with
 * rows keeps a few, so a lane with small numbers is not pushed out by a lane
 * with many.
 */
export function selectLegacyList(rows: PublishedOpportunity[]): PublishedOpportunity[] {
  const ordered = [...rows].sort(compareOpportunities);
  const chosen: PublishedOpportunity[] = [];
  const chosenIds = new Set<string>();
  const perStrategy = new Map<string, number>();

  for (const row of ordered) {
    const count = perStrategy.get(row.strategy) ?? 0;

    if (count < MIN_ROWS_PER_STRATEGY) {
      chosen.push(row);
      chosenIds.add(row.id);
      perStrategy.set(row.strategy, count + 1);
    }
  }

  for (const row of ordered) {
    if (chosen.length >= MAX_PUBLISHED_OPPORTUNITIES) {
      break;
    }

    if (!chosenIds.has(row.id)) {
      chosen.push(row);
      chosenIds.add(row.id);
    }
  }

  return chosen.sort(compareOpportunities).slice(0, MAX_PUBLISHED_OPPORTUNITIES);
}

function perClass(rows: PublishedOpportunity[]): PublishedOpportunity[] {
  const counts = new Map<string, number>();

  return [...rows].sort(compareOpportunities).filter((row) => {
    const key = row.class ?? row.strategy;
    const count = counts.get(key) ?? 0;

    if (count >= MAX_ROWS_PER_CLASS) {
      return false;
    }

    counts.set(key, count + 1);

    return true;
  });
}

function buildRejectedExamples(
  rows: PublishedOpportunity[],
  rejections: ArbScanSnapshot["rejections_24h"],
): ArbScanSnapshot["rejected_examples"] {
  const byReason = new Map<string, PublishedOpportunity[]>();

  for (const row of rows) {
    if (row.status !== "rejected" || !row.rejection_reason) {
      continue;
    }

    byReason.set(row.rejection_reason, [...(byReason.get(row.rejection_reason) ?? []), row]);
  }

  return rejections.map((rejection) => ({
    reason: rejection.reason,
    label: rejection.label,
    gate: rejection.gate,
    count_24h: rejection.count,
    examples: (byReason.get(rejection.reason) ?? [])
      .sort((left, right) => right.last_seen_at.localeCompare(left.last_seen_at))
      .slice(0, MAX_REJECTED_EXAMPLES_PER_REASON),
  }));
}

function toPublishedPair(
  pair: ReturnType<typeof listCrossVenuePairsSince>[number],
): ArbScanSnapshot["pairs"][number] {
  const review: RuleReviewStatus = isRuleReviewStatus(pair.ruleReview) ? pair.ruleReview : "none";
  const screen = isRuleScreenStatus(pair.ruleScreen) ? pair.ruleScreen : null;
  const gapDays =
    pair.resolutionAtKalshi !== null && pair.resolutionAtPolymarket !== null
      ? round2(Math.abs(pair.resolutionAtKalshi - pair.resolutionAtPolymarket) / 86_400_000)
      : null;

  return {
    pair_id: pair.pairId,
    title: pair.title ?? pair.polymarketQuestion ?? pair.kalshiTitle ?? pair.pairId,
    category: pair.category,
    source: pair.source === "config" ? "config" : "discovery",
    kalshi: {
      ticker: pair.kalshiTicker,
      title: pair.kalshiTitle,
      resolution_at: toIso(pair.resolutionAtKalshi),
      rules_excerpt: pair.kalshiRulesExcerpt,
    },
    polymarket: {
      slug: pair.polymarketSlug,
      question: pair.polymarketQuestion,
      resolution_at: toIso(pair.resolutionAtPolymarket),
      rules_excerpt: pair.polymarketRulesExcerpt,
    },
    resolution_gap_days: gapDays,
    rule_screen: screen,
    rule_screen_detail: pair.ruleScreenDetail,
    rule_review: review,
    review: pair.review
      ? {
          verdict: isRuleReviewStatus(pair.review.verdict) ? pair.review.verdict : "none",
          date: pair.review.date ?? null,
          reviewer: pair.review.reviewer ?? null,
          note: pair.review.note ?? null,
          checklist: pair.review.checklist ?? null,
          source: pair.review.source ?? null,
        }
      : null,
    hedged: isHedged(screen, review),
    last: {
      gross_cents: pair.lastGrossCents,
      net_cents: pair.lastNetCents,
      annualized_pct: pair.lastAnnualizedPct,
      executable_size: pair.lastExecutableSize,
      status: pair.lastStatus,
    },
    first_seen_at: new Date(pair.firstSeenAt).toISOString(),
    last_seen_at: new Date(pair.lastSeenAt).toISOString(),
  };
}

export function comparePairs(
  left: ArbScanSnapshot["pairs"][number],
  right: ArbScanSnapshot["pairs"][number],
): number {
  if (left.hedged !== right.hedged) {
    return left.hedged ? -1 : 1;
  }

  const leftNet = left.last.net_cents ?? Number.NEGATIVE_INFINITY;
  const rightNet = right.last.net_cents ?? Number.NEGATIVE_INFINITY;

  if (leftNet !== rightNet) {
    return rightNet - leftNet;
  }

  return right.last_seen_at.localeCompare(left.last_seen_at) || left.pair_id.localeCompare(right.pair_id);
}

const STATUS_ORDER: Record<PublishedOpportunity["status"], number> = {
  validated: 0,
  candidate: 1,
  rejected: 2,
};

export function compareOpportunities(left: PublishedOpportunity, right: PublishedOpportunity): number {
  if (left.status !== right.status) {
    return STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
  }

  const leftProfit = left.net_profit_usd ?? Number.NEGATIVE_INFINITY;
  const rightProfit = right.net_profit_usd ?? Number.NEGATIVE_INFINITY;

  if (leftProfit !== rightProfit) {
    return rightProfit - leftProfit;
  }

  const leftAnnualized = left.annualized_pct ?? Number.NEGATIVE_INFINITY;
  const rightAnnualized = right.annualized_pct ?? Number.NEGATIVE_INFINITY;

  if (leftAnnualized !== rightAnnualized) {
    return rightAnnualized - leftAnnualized;
  }

  return right.last_seen_at.localeCompare(left.last_seen_at) || left.id.localeCompare(right.id);
}

/** Only structural classes may carry the word arbitrage on the website. */
export function isArbitrageClass(value: OpportunityClass | null): boolean {
  return isStructuralClass(value);
}

function toIso(value: number | null | undefined): string | null {
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : new Date(value).toISOString();
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
