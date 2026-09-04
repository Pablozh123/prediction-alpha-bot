import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  normalizeRejectionReason,
  REJECTION_REASONS,
  type RejectionReason,
} from "../core/rejectionReasons.js";
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
 * The file is also the heartbeat: `health.last_cycle_at` and `cycles_24h`
 * come from the scan_cycles table, and `alive` is false as soon as the last
 * cycle is older than three intervals (floor: ten minutes). Silence is the failure mode this
 * project fears most; the file makes silence visible.
 */

export const ARB_SCAN_SCHEMA = "arb_scan/1";
export const ARB_SCAN_FILENAME = "arb_scan.json";
export const ARB_SCAN_DISCLAIMER = "Paper-only research. Not trading advice.";
export const DEFAULT_PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_PUBLISHED_OPPORTUNITIES = 50;
export const MAX_PUBLISHED_PAPER_POSITIONS = 50;
/**
 * `alive` tolerates the longer of three scan intervals or ten minutes. A cycle
 * that walks hundreds of books can take over a minute and its timestamp is the
 * cycle start, so a tighter floor would flag a healthy scanner as dead.
 */
export const STALE_FLOOR_MS = 600_000;

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

const isoString = z.string().datetime({ offset: true });
const nonNegativeInt = z.number().int().nonnegative();

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
  venues: z.array(z.string().min(1)),
  title: z.string(),
  market_ref: z.string(),
  legs: z.array(arbScanLegSchema),
  gross_edge_bps: z.number(),
  executable_net_edge_bps: z.number(),
  depth_usd: z.number(),
  capital_usd: z.number(),
  days_to_resolution: z.number().nullable(),
  annualized_pct: z.number().nullable(),
  status: z.enum(["validated", "rejected"]),
  rejection_reason: z.string().nullable(),
  rule_match: z.enum(["unverified", "reviewed", "mismatch"]),
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
    scan_interval_ms: z.number().int().positive(),
    alive: z.boolean(),
  }),
  summary: z.object({
    raw_candidates_24h: nonNegativeInt,
    validated_24h: nonNegativeInt,
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
      raw_24h: nonNegativeInt,
      validated_24h: nonNegativeInt,
      paper_24h: nonNegativeInt,
      top_rejection: z.string().nullable(),
    }),
  ),
  rejections_24h: z.array(
    z.object({
      reason: z.string().min(1),
      count: nonNegativeInt,
    }),
  ),
  opportunities: z.array(arbScanOpportunitySchema).max(MAX_PUBLISHED_OPPORTUNITIES),
  paper_positions: z
    .array(arbScanPaperPositionSchema)
    .max(MAX_PUBLISHED_PAPER_POSITIONS),
});

export type ArbScanSnapshot = z.infer<typeof arbScanSchema>;

export type BuildArbScanSnapshotOptions = {
  nowMs?: number;
  scanIntervalMs: number;
  gitSha?: string;
  windowMs?: number;
  /** Extra note appended to the sample note, e.g. the measurement window. */
  sampleNote?: string;
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

export function buildArbScanSnapshot(
  options: BuildArbScanSnapshotOptions,
): ArbScanSnapshot {
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_PUBLISH_WINDOW_MS;
  const sinceMs = nowMs - windowMs;
  const cycles = readScanCycleHealth(sinceMs);
  const runs = readScannerRunsByStrategy(sinceMs);
  const statusCounts = countOpportunitiesByStatusSince(sinceMs);
  const paper = summarizePaperTrades(sinceMs);
  const staleAfterMs = Math.max(3 * options.scanIntervalMs, STALE_FLOOR_MS);
  const alive =
    cycles.lastCycleAt !== null && nowMs - cycles.lastCycleAt <= staleAfterMs;

  const strategyIds = new Set<string>([
    ...ALWAYS_LISTED_STRATEGIES,
    ...runs.keys(),
  ]);
  const strategies = [...strategyIds].map((id) => {
    const run = runs.get(id);
    const topRejection = countRejectionReasonsSince(sinceMs, id)[0];

    return {
      id,
      label: STRATEGY_LABELS[id] ?? id,
      raw_24h: run?.raw ?? 0,
      validated_24h: run?.validated ?? 0,
      paper_24h: run?.paperTrades ?? 0,
      top_rejection: topRejection ? normalizeRejectionReason(topRejection.reason) : null,
    };
  });

  const rejections = aggregateRejections(sinceMs);
  const opportunities = listLatestOpportunitiesByKey(sinceMs, 500)
    .map((row) => toPublishedOpportunity(row))
    .sort(compareOpportunities)
    .slice(0, MAX_PUBLISHED_OPPORTUNITIES);
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
      scan_interval_ms: options.scanIntervalMs,
      alive,
    },
    summary: {
      raw_candidates_24h: [...runs.values()].reduce((sum, run) => sum + run.raw, 0),
      validated_24h: statusCounts.validated + statusCounts.paper_fired,
      paper_fired_24h: paper.firedSince,
      open_paper_positions: paper.open,
      resolved_paper_trades: paper.resolved,
      resolved_paper_pnl_usd: paper.resolvedPnlUsd,
      sample_note: sampleNoteParts.join(". ") + ".",
    },
    strategies,
    rejections_24h: rejections,
    opportunities,
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

type StrategyRunAggregate = { raw: number; validated: number; paperTrades: number };

function readScannerRunsByStrategy(
  sinceMs: number,
): Map<string, StrategyRunAggregate> & { errorCount: number } {
  type Row = {
    strategy: string;
    raw: number;
    validated: number;
    paper_trades: number;
    errors: number;
  };
  const rows = getDb()
    .prepare<Row>(
      `
      SELECT
        strategy,
        SUM(raw_opportunities) AS raw,
        SUM(validated_opportunities) AS validated,
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
      validated: row.validated ?? 0,
      paperTrades: row.paper_trades ?? 0,
    });
    errorCount += row.errors ?? 0;
  }

  map.errorCount = errorCount;

  return map;
}

function aggregateRejections(sinceMs: number): Array<{ reason: string; count: number }> {
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
    .map(([reason, count]) => ({ reason, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        REJECTION_REASONS.indexOf(left.reason) - REJECTION_REASONS.indexOf(right.reason),
    );
}

type PublishedOpportunity = ArbScanSnapshot["opportunities"][number];

function toPublishedOpportunity(row: OpportunityWindowRow): PublishedOpportunity {
  const legs = listOpportunityLegs(row.id);
  const status: PublishedOpportunity["status"] =
    row.status === "validated" || row.status === "paper_fired" ? "validated" : "rejected";

  return {
    id: row.id,
    strategy: row.strategy,
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
    gross_edge_bps: round2(
      row.grossEdgeBps ?? (row.rawEdge !== null ? row.rawEdge * 10_000 : 0),
    ),
    executable_net_edge_bps: round2(
      row.netEdgeBps ?? (row.executableEdge !== null ? row.executableEdge * 10_000 : 0),
    ),
    depth_usd: round4(row.depthUsd ?? row.minLegDepthUsd ?? 0),
    capital_usd: round4(row.capitalUsd ?? row.basketCostUsd ?? 0),
    days_to_resolution: row.daysToResolution,
    annualized_pct: row.annualizedPct,
    status,
    rejection_reason: status === "rejected" ? normalizeRejectionReason(row.reason) : null,
    rule_match: row.ruleMatch ?? "unverified",
    first_seen_at: new Date(row.firstSeenAt).toISOString(),
    last_seen_at: new Date(row.lastSeenAt).toISOString(),
    open_seconds: Math.max(0, Math.floor((row.lastSeenAt - row.firstSeenAt) / 1000)),
  };
}

function compareOpportunities(left: PublishedOpportunity, right: PublishedOpportunity): number {
  if (left.status !== right.status) {
    return left.status === "validated" ? -1 : 1;
  }

  const leftAnnualized = left.annualized_pct ?? Number.NEGATIVE_INFINITY;
  const rightAnnualized = right.annualized_pct ?? Number.NEGATIVE_INFINITY;

  if (leftAnnualized !== rightAnnualized) {
    return rightAnnualized - leftAnnualized;
  }

  return right.last_seen_at.localeCompare(left.last_seen_at) || left.id.localeCompare(right.id);
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
