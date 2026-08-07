import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

type SqliteStatement<T = unknown> = {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
};

type SqliteDatabase = {
  prepare<T = unknown>(sql: string): SqliteStatement<T>;
  close(): void;
};

type DatabaseConstructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

type StrategyEvaluationCliOptions = {
  dbPath?: string;
  reportDate?: string;
};

export type TableSchema = {
  exists: boolean;
  columns: string[];
};

export type SchemaInfo = Record<string, TableSchema>;

export type MetricAvailability<T> =
  | {
      available: true;
      value: T;
    }
  | {
      available: false;
      reason: string;
    };

export type OpportunityEvaluationRow = {
  id: string;
  strategy: string;
  slug: string | null;
  rawEdge: number | null;
  executableEdge: number | null;
  status: string;
  reason: string | null;
  tokenIds: string | null;
  timestamp: number | null;
  fillableUsd: number | null;
  minLegDepthUsd: number | null;
  legCount: number | null;
  executableSum: number | null;
  feeAdjustedEdge: number | null;
};

export type PaperTradeEvaluationRow = {
  strategy: string;
  resolved: number | null;
  pnl: number | null;
  opportunityId: string | null;
  timestamp: number | null;
};

export type ScanCycleEvaluationRow = {
  timestamp: number | null;
  success: number | null;
  opportunities: number | null;
  paperTrades: number | null;
  skippedDuplicates: number | null;
  rejectedOpportunities: number | null;
};

export type ScannerRunEvaluationRow = {
  strategy: string;
  timestamp: number | null;
  rawOpportunities: number | null;
  validatedOpportunities: number | null;
  rejectedOpportunities: number | null;
  dedupeSkips: number | null;
  paperTrades: number | null;
};

export type PaperFireDedupeEvaluationRow = {
  strategy: string;
  firedAt: number | null;
};

export type PaperDedupeSkipEvaluationRow = {
  strategy: string;
  skippedAt: number | null;
};

export type NumberSummary = {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};

export type StrategyVerdict = "CONTINUE_TESTING" | "NEEDS_FIX" | "PAUSE";

export type FunnelMetrics = {
  strategy: string;
  rawFound: number;
  currentRawFound: number;
  validated: number;
  rejected: number;
  paperFired: number;
  dedupeSkipped: number;
  validatedRate: number | null;
  rejectedRate: number | null;
  paperFiredRate: number | null;
  dedupeSkippedRate: number | null;
};

export type RejectionReasonMetric = {
  strategy: string;
  reason: string;
  count: number;
};

export type EdgeQualityMetrics = {
  strategy: string;
  rawEdgeBps: NumberSummary;
  executableEdgeBps: NumberSummary;
  feeAdjustedEdgeBps: MetricAvailability<NumberSummary>;
};

export type CapacityMetrics = {
  strategy: string;
  fillableUsd: MetricAvailability<NumberSummary>;
  minLegDepthUsd: MetricAvailability<NumberSummary>;
};

export type TopOpportunityMetric = {
  strategy: string;
  slug: string | null;
  rawEdgeBps: number | null;
  executableEdgeBps: number | null;
  fillableUsd: number | null;
  minLegDepthUsd: number | null;
  legCount: number | null;
  executableSum: number | null;
  executableEdgeTimesFillableUsd: number | null;
  status: string;
  reason: string | null;
  timestamp: number | null;
};

export type HourlyMetric = {
  hour: string;
  opportunities: number;
  validated: number;
  rejected: number;
};

export type PaperTradeMetrics = {
  strategy: string;
  count: number;
  unresolved: number;
  resolved: number;
  note: string;
};

export type StrategyVerdictMetric = {
  strategy: string;
  verdict: StrategyVerdict;
  reason: string;
};

export type StrategyEvaluationReport = {
  generatedAt: string;
  dbPath: string;
  schema: SchemaInfo;
  runSummary: {
    startTime: string | null;
    endTime: string | null;
    durationHours: number | null;
    strategiesFound: string[];
    scanCycles: MetricAvailability<{
      total: number;
      successful: number;
      failed: number;
      totalOpportunities: number;
      totalPaperTrades: number;
      totalRejectedOpportunities: number;
      totalSkippedDuplicates: number;
    }>;
    liveTradesCount: MetricAvailability<number>;
  };
  funnel: FunnelMetrics[];
  rejectionReasons: RejectionReasonMetric[];
  edgeQuality: EdgeQualityMetrics[];
  capacity: CapacityMetrics[];
  topByExecutableEdge: TopOpportunityMetric[];
  topByExecutableEdgeTimesFillableUsd: MetricAvailability<
    TopOpportunityMetric[]
  >;
  timeAnalysis: {
    opportunitiesPerHour: number | null;
    validatedPerHour: number | null;
    rejectedPerHour: number | null;
    hourly: HourlyMetric[];
  };
  paperTrades: PaperTradeMetrics[];
  dataQualityWarnings: string[];
  verdicts: StrategyVerdictMetric[];
};

type DbColumnRow = {
  name: string;
};

type CountRow = {
  count: number;
};

type RawOpportunityRow = {
  id: string | null;
  strategy: string | null;
  slug: string | null;
  raw_edge: number | null;
  executable_edge: number | null;
  status: string | null;
  reason: string | null;
  token_ids: string | null;
  timestamp: number | null;
  fillable_usd: number | null;
  min_leg_depth_usd: number | null;
  leg_count: number | null;
  executable_sum: number | null;
  fee_adjusted_edge: number | null;
};

type RawPaperTradeRow = {
  strategy: string | null;
  resolved: number | null;
  pnl: number | null;
  opportunity_id: string | null;
  timestamp: number | null;
};

type RawScanCycleRow = {
  timestamp: number | null;
  success: number | null;
  opportunities: number | null;
  paper_trades: number | null;
  skipped_duplicates: number | null;
  rejected_opportunities: number | null;
};

type RawScannerRunRow = {
  strategy: string | null;
  timestamp: number | null;
  raw_opportunities: number | null;
  validated_opportunities: number | null;
  rejected_opportunities: number | null;
  dedupe_skips: number | null;
  paper_trades: number | null;
};

type RawPaperFireDedupeRow = {
  strategy: string | null;
  fired_at: number | null;
};

type RawPaperDedupeSkipRow = {
  strategy: string | null;
  skipped_at: number | null;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const REPORT_TABLES = [
  "opportunities",
  "opportunity_legs",
  "orderbook_snapshots",
  "scanner_runs",
  "paper_trades",
  "scan_cycles",
  "paper_fire_dedup",
  "paper_dedupe_skips",
  "live_trades",
];

export async function runStrategyEvaluation(
  dbPath = process.env.DATABASE_PATH ?? resolve("logs", "trades.db"),
  reportDate = formatDate(new Date()),
): Promise<StrategyEvaluationReport> {
  const resolvedDbPath = resolve(dbPath);
  const reportBasePath = resolve(
    "docs",
    "reports",
    `strategy-evaluation-${reportDate}`,
  );

  if (!existsSync(resolvedDbPath)) {
    const report = buildStrategyEvaluation({
      dbPath: resolvedDbPath,
      generatedAt: new Date().toISOString(),
      schema: emptySchema(),
      opportunities: [],
      paperTrades: [],
      scanCycles: [],
      scannerRuns: [],
      paperFireDedup: [],
      paperDedupeSkips: [],
      liveTradesCount: unavailable("live_trades table unavailable"),
    });

    writeReports(reportBasePath, report);
    printConsoleSummary(report, reportBasePath);

    return report;
  }

  const db = new Database(resolvedDbPath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const schema = detectSchema(db);
    const report = buildStrategyEvaluation({
      dbPath: resolvedDbPath,
      generatedAt: new Date().toISOString(),
      schema,
      opportunities: loadOpportunityRows(db, schema),
      paperTrades: loadPaperTradeRows(db, schema),
      scanCycles: loadScanCycleRows(db, schema),
      scannerRuns: loadScannerRunRows(db, schema),
      paperFireDedup: loadPaperFireDedupeRows(db, schema),
      paperDedupeSkips: loadPaperDedupeSkipRows(db, schema),
      liveTradesCount: tableExists(schema, "live_trades")
        ? available(countRows(db, "live_trades"))
        : unavailable("live_trades table unavailable"),
    });

    writeReports(reportBasePath, report);
    printConsoleSummary(report, reportBasePath);

    return report;
  } finally {
    db.close();
  }
}

export function detectSchema(db: SqliteDatabase): SchemaInfo {
  return Object.fromEntries(
    REPORT_TABLES.map((tableName) => {
      const exists =
        db
          .prepare<{
            name: string;
          }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(tableName) !== undefined;
      const columns = exists
        ? db
            .prepare<DbColumnRow>(`PRAGMA table_info(${tableName})`)
            .all()
            .map((row) => row.name)
        : [];

      return [tableName, { exists, columns }];
    }),
  );
}

export function buildStrategyEvaluation(input: {
  dbPath: string;
  generatedAt: string;
  schema: SchemaInfo;
  opportunities: OpportunityEvaluationRow[];
  paperTrades: PaperTradeEvaluationRow[];
  scanCycles: ScanCycleEvaluationRow[];
  scannerRuns?: ScannerRunEvaluationRow[];
  paperFireDedup: PaperFireDedupeEvaluationRow[];
  paperDedupeSkips?: PaperDedupeSkipEvaluationRow[];
  liveTradesCount: MetricAvailability<number>;
}): StrategyEvaluationReport {
  const paperDedupeSkips = input.paperDedupeSkips ?? [];
  const strategies = collectStrategies(
    input.opportunities,
    input.paperTrades,
    paperDedupeSkips,
    input.scannerRuns ?? [],
  );
  const runSummary = buildRunSummary(input);
  const funnel = buildFunnelMetrics(
    input.opportunities,
    strategies,
    paperDedupeSkips,
    input.scannerRuns ?? [],
  );
  const rejectionReasons = buildRejectionReasons(input.opportunities);
  const edgeQuality = buildEdgeQuality(
    input.opportunities,
    strategies,
    input.schema,
  );
  const capacity = buildCapacityMetrics(
    input.opportunities,
    strategies,
    input.schema,
  );
  const topByExecutableEdge = buildTopByExecutableEdge(input.opportunities);
  const topByExecutableEdgeTimesFillableUsd = columnExists(
    input.schema,
    "opportunities",
    "fillable_usd",
  )
    ? available(buildTopByExecutableEdgeTimesFillableUsd(input.opportunities))
    : unavailable("opportunities.fillable_usd column unavailable");
  const paperTrades = buildPaperTradeMetrics(input.paperTrades, strategies);
  const verdicts = classifyStrategies({
    edgeQuality,
    funnel,
    paperTrades,
    rejectionReasons,
  });

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    schema: input.schema,
    runSummary,
    funnel,
    rejectionReasons,
    edgeQuality,
    capacity,
    topByExecutableEdge,
    topByExecutableEdgeTimesFillableUsd,
    timeAnalysis: buildTimeAnalysis(
      input.opportunities,
      runSummary.durationHours,
    ),
    paperTrades,
    dataQualityWarnings: buildDataQualityWarnings(
      input.schema,
      input.paperTrades,
    ),
    verdicts,
  };
}

export function median(values: number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);

  if (finite.length === 0) {
    return null;
  }

  const middle = Math.floor(finite.length / 2);

  if (finite.length % 2 === 1) {
    return finite[middle] ?? null;
  }

  const left = finite[middle - 1];
  const right = finite[middle];

  return left === undefined || right === undefined ? null : (left + right) / 2;
}

export function edgeToBps(edge: number | null): number | null {
  return edge === null || !Number.isFinite(edge)
    ? null
    : round(edge * 10_000, 2);
}

export function classifyStrategy(input: {
  funnel: FunnelMetrics;
  edgeQuality: EdgeQualityMetrics;
  rejectionReasons: RejectionReasonMetric[];
}): StrategyVerdictMetric {
  const executable = input.edgeQuality.executableEdgeBps;
  const rejectionRate = input.funnel.rejectedRate ?? 0;
  const dominantReason = input.rejectionReasons[0];
  const dominantRejectionRate =
    dominantReason && input.funnel.rawFound > 0
      ? dominantReason.count / input.funnel.rawFound
      : 0;
  const hasPositiveExecutableEdge =
    (executable.avg ?? 0) > 0 && (executable.median ?? 0) > 0;

  if (
    input.funnel.rawFound > 0 &&
    input.funnel.validated === 0 &&
    rejectionRate >= 0.9 &&
    isHardRejectionReason(dominantReason?.reason)
  ) {
    return {
      strategy: input.funnel.strategy,
      verdict: "PAUSE",
      reason: `No validated opportunities and dominant hard rejection "${dominantReason?.reason ?? "unknown"}".`,
    };
  }

  if (
    input.funnel.validated > 0 &&
    hasPositiveExecutableEdge &&
    dominantRejectionRate < 0.75
  ) {
    return {
      strategy: input.funnel.strategy,
      verdict: "CONTINUE_TESTING",
      reason:
        "Validated sample has positive executable edge; keep collecting paper data.",
    };
  }

  if (input.funnel.rawFound > 0) {
    return {
      strategy: input.funnel.strategy,
      verdict: "NEEDS_FIX",
      reason:
        "Raw opportunities exist, but validation, edge, or data quality is not strong enough.",
    };
  }

  return {
    strategy: input.funnel.strategy,
    verdict: "PAUSE",
    reason: "No usable opportunities were found.",
  };
}

export function columnExists(
  schema: SchemaInfo,
  tableName: string,
  columnName: string,
): boolean {
  return schema[tableName]?.columns.includes(columnName) ?? false;
}

function buildRunSummary(input: {
  schema: SchemaInfo;
  opportunities: OpportunityEvaluationRow[];
  paperTrades: PaperTradeEvaluationRow[];
  scanCycles: ScanCycleEvaluationRow[];
  scannerRuns?: ScannerRunEvaluationRow[];
  liveTradesCount: MetricAvailability<number>;
}): StrategyEvaluationReport["runSummary"] {
  const timestamps = [
    ...input.opportunities.map((row) => row.timestamp),
    ...input.scanCycles.map((row) => row.timestamp),
    ...(input.scannerRuns ?? []).map((row) => row.timestamp),
  ].filter(isFiniteNumber);
  const timestampRange = minMax(timestamps);
  const start = timestampRange.min;
  const end = timestampRange.max;
  const durationHours =
    start !== null && end !== null
      ? round(Math.max(0, end - start) / 3_600_000, 4)
      : null;

  return {
    startTime: start === null ? null : new Date(start).toISOString(),
    endTime: end === null ? null : new Date(end).toISOString(),
    durationHours,
    strategiesFound: collectStrategies(
      input.opportunities,
      input.paperTrades,
      [],
      input.scannerRuns ?? [],
    ),
    scanCycles: tableExists(input.schema, "scan_cycles")
      ? available({
          total: input.scanCycles.length,
          successful: input.scanCycles.filter((row) => row.success === 1)
            .length,
          failed: input.scanCycles.filter((row) => row.success === 0).length,
          totalOpportunities: sumNumbers(
            input.scanCycles.map((row) => row.opportunities),
          ),
          totalPaperTrades: sumNumbers(
            input.scanCycles.map((row) => row.paperTrades),
          ),
          totalRejectedOpportunities: sumNumbers(
            input.scanCycles.map((row) => row.rejectedOpportunities),
          ),
          totalSkippedDuplicates: sumNumbers(
            input.scanCycles.map((row) => row.skippedDuplicates),
          ),
        })
      : unavailable("scan_cycles table unavailable"),
    liveTradesCount: input.liveTradesCount,
  };
}

function buildFunnelMetrics(
  rows: OpportunityEvaluationRow[],
  strategies: string[],
  dedupeSkips: PaperDedupeSkipEvaluationRow[] = [],
  scannerRuns: ScannerRunEvaluationRow[] = [],
): FunnelMetrics[] {
  return strategies
    .map((strategy) => {
      const strategyRows = rows.filter((row) => row.strategy === strategy);
      const strategyScannerRuns = scannerRuns.filter(
        (row) => row.strategy === strategy,
      );
      const scannerRawFound = sumNumbers(
        strategyScannerRuns.map((row) => row.rawOpportunities),
      );
      const rawFound = Math.max(strategyRows.length, scannerRawFound);
      const currentRawFound = countStatus(strategyRows, "raw_found");
      const paperFired = countStatus(strategyRows, "paper_fired");
      const validated = countStatus(strategyRows, "validated") + paperFired;
      const legacyDedupeSkipped = strategyRows.filter(
        (row) =>
          row.status === "rejected" &&
          row.reason === "duplicate_within_cooldown",
      ).length;
      const rejected =
        countStatus(strategyRows, "rejected") - legacyDedupeSkipped;
      const dedupeSkipped =
        legacyDedupeSkipped +
        (dedupeSkips.length > 0
          ? dedupeSkips.filter((row) => row.strategy === strategy).length
          : sumNumbers(strategyScannerRuns.map((row) => row.dedupeSkips)));

      return {
        strategy,
        rawFound,
        currentRawFound,
        validated,
        rejected,
        paperFired,
        dedupeSkipped,
        validatedRate: rate(validated, rawFound),
        rejectedRate: rate(rejected, rawFound),
        paperFiredRate: rate(paperFired, rawFound),
        dedupeSkippedRate: rate(dedupeSkipped, rawFound),
      };
    })
    .sort(
      (a, b) => b.rawFound - a.rawFound || a.strategy.localeCompare(b.strategy),
    );
}

export function buildRejectionReasons(
  rows: OpportunityEvaluationRow[],
): RejectionReasonMetric[] {
  const counts = new Map<string, RejectionReasonMetric>();

  for (const row of rows) {
    if (row.status !== "rejected") {
      continue;
    }

    const reason = row.reason ?? "unknown";

    if (reason === "duplicate_within_cooldown") {
      continue;
    }

    const key = `${row.strategy}\u0000${reason}`;
    const current = counts.get(key);

    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        strategy: row.strategy,
        reason,
        count: 1,
      });
    }
  }

  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.strategy.localeCompare(b.strategy) ||
      a.reason.localeCompare(b.reason),
  );
}

function buildEdgeQuality(
  rows: OpportunityEvaluationRow[],
  strategies: string[],
  schema: SchemaInfo,
): EdgeQualityMetrics[] {
  return strategies.map((strategy) => {
    const strategyRows = rows.filter((row) => row.strategy === strategy);

    return {
      strategy,
      rawEdgeBps: summarizeNumbers(
        strategyRows.map((row) => edgeToBps(row.rawEdge)),
      ),
      executableEdgeBps: summarizeNumbers(
        strategyRows.map((row) => edgeToBps(row.executableEdge)),
      ),
      feeAdjustedEdgeBps: columnExists(
        schema,
        "opportunities",
        "fee_adjusted_edge",
      )
        ? available(
            summarizeNumbers(
              strategyRows.map((row) => edgeToBps(row.feeAdjustedEdge)),
            ),
          )
        : unavailable("opportunities.fee_adjusted_edge column unavailable"),
    };
  });
}

function buildCapacityMetrics(
  rows: OpportunityEvaluationRow[],
  strategies: string[],
  schema: SchemaInfo,
): CapacityMetrics[] {
  const fillableAvailable = columnExists(
    schema,
    "opportunities",
    "fillable_usd",
  );
  const minLegDepthAvailable = columnExists(
    schema,
    "opportunities",
    "min_leg_depth_usd",
  );

  return strategies.map((strategy) => {
    const strategyRows = rows.filter((row) => row.strategy === strategy);

    return {
      strategy,
      fillableUsd: fillableAvailable
        ? available(
            summarizeNumbers(strategyRows.map((row) => row.fillableUsd)),
          )
        : unavailable("opportunities.fillable_usd column unavailable"),
      minLegDepthUsd: minLegDepthAvailable
        ? available(
            summarizeNumbers(strategyRows.map((row) => row.minLegDepthUsd)),
          )
        : unavailable("opportunities.min_leg_depth_usd column unavailable"),
    };
  });
}

function buildTopByExecutableEdge(
  rows: OpportunityEvaluationRow[],
): TopOpportunityMetric[] {
  return rows
    .filter((row) => row.executableEdge !== null)
    .map(toTopOpportunityMetric)
    .sort(
      (a, b) =>
        (b.executableEdgeBps ?? Number.NEGATIVE_INFINITY) -
          (a.executableEdgeBps ?? Number.NEGATIVE_INFINITY) ||
        (b.timestamp ?? 0) - (a.timestamp ?? 0),
    )
    .slice(0, 20);
}

function buildTopByExecutableEdgeTimesFillableUsd(
  rows: OpportunityEvaluationRow[],
): TopOpportunityMetric[] {
  return rows
    .filter((row) => row.executableEdge !== null && row.fillableUsd !== null)
    .map(toTopOpportunityMetric)
    .filter((row) => row.executableEdgeTimesFillableUsd !== null)
    .sort(
      (a, b) =>
        (b.executableEdgeTimesFillableUsd ?? Number.NEGATIVE_INFINITY) -
        (a.executableEdgeTimesFillableUsd ?? Number.NEGATIVE_INFINITY),
    )
    .slice(0, 20);
}

function buildTimeAnalysis(
  rows: OpportunityEvaluationRow[],
  durationHours: number | null,
): StrategyEvaluationReport["timeAnalysis"] {
  const usableDuration =
    durationHours !== null && durationHours > 0 ? durationHours : null;
  const validated = rows.filter(
    (row) => row.status === "validated" || row.status === "paper_fired",
  ).length;
  const hardRejected = rows.filter(
    (row) =>
      row.status === "rejected" && row.reason !== "duplicate_within_cooldown",
  ).length;

  return {
    opportunitiesPerHour:
      usableDuration === null ? null : round(rows.length / usableDuration, 2),
    validatedPerHour:
      usableDuration === null ? null : round(validated / usableDuration, 2),
    rejectedPerHour:
      usableDuration === null ? null : round(hardRejected / usableDuration, 2),
    hourly: buildHourlyMetrics(rows),
  };
}

function buildHourlyMetrics(rows: OpportunityEvaluationRow[]): HourlyMetric[] {
  const buckets = new Map<string, HourlyMetric>();

  for (const row of rows) {
    if (row.timestamp === null) {
      continue;
    }

    const hour = new Date(Math.floor(row.timestamp / 3_600_000) * 3_600_000)
      .toISOString()
      .slice(0, 13);
    const bucket = buckets.get(hour) ?? {
      hour,
      opportunities: 0,
      validated: 0,
      rejected: 0,
    };

    bucket.opportunities += 1;

    if (row.status === "validated" || row.status === "paper_fired") {
      bucket.validated += 1;
    }

    if (
      row.status === "rejected" &&
      row.reason !== "duplicate_within_cooldown"
    ) {
      bucket.rejected += 1;
    }

    buckets.set(hour, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

function buildPaperTradeMetrics(
  rows: PaperTradeEvaluationRow[],
  strategies: string[],
): PaperTradeMetrics[] {
  return strategies
    .map((strategy) => {
      const strategyRows = rows.filter((row) => row.strategy === strategy);
      const resolved = strategyRows.filter((row) => row.resolved === 1).length;
      const unresolved = strategyRows.filter(
        (row) => row.resolved !== 1,
      ).length;

      return {
        strategy,
        count: strategyRows.length,
        unresolved,
        resolved,
        note:
          resolved < 30
            ? "insufficient resolved sample"
            : "resolved sample present; no win-rate verdict is calculated here",
      };
    })
    .filter((row) => row.count > 0 || strategies.includes(row.strategy))
    .sort((a, b) => b.count - a.count || a.strategy.localeCompare(b.strategy));
}

function classifyStrategies(input: {
  funnel: FunnelMetrics[];
  edgeQuality: EdgeQualityMetrics[];
  paperTrades: PaperTradeMetrics[];
  rejectionReasons: RejectionReasonMetric[];
}): StrategyVerdictMetric[] {
  return input.funnel.map((funnel) => {
    const edgeQuality =
      input.edgeQuality.find((row) => row.strategy === funnel.strategy) ??
      emptyEdgeQuality(funnel.strategy);
    const rejectionReasons = input.rejectionReasons.filter(
      (row) => row.strategy === funnel.strategy,
    );

    return classifyStrategy({
      funnel,
      edgeQuality,
      rejectionReasons,
    });
  });
}

function buildDataQualityWarnings(
  schema: SchemaInfo,
  paperTrades: PaperTradeEvaluationRow[],
): string[] {
  const warnings: string[] = [];

  for (const columnName of [
    "fillable_usd",
    "min_leg_depth_usd",
    "leg_count",
    "executable_sum",
    "fee_adjusted_edge",
  ]) {
    if (!columnExists(schema, "opportunities", columnName)) {
      warnings.push(`opportunities.${columnName} unavailable`);
    }
  }

  if (!columnExists(schema, "paper_trades", "opportunity_id")) {
    warnings.push("paper_trades.opportunity_id unavailable");
  } else {
    const unlinked = paperTrades.filter(
      (row) => row.opportunityId === null,
    ).length;

    if (unlinked > 0) {
      warnings.push(`${unlinked} paper trade(s) have no opportunity_id link`);
    }
  }

  return warnings;
}

function loadOpportunityRows(
  db: SqliteDatabase,
  schema: SchemaInfo,
): OpportunityEvaluationRow[] {
  if (!tableExists(schema, "opportunities")) {
    return [];
  }

  const rows = db
    .prepare<RawOpportunityRow>(
      `
      SELECT
        ${selectColumn(schema, "opportunities", "id", "''")},
        ${selectColumn(schema, "opportunities", "strategy", "'unknown'")},
        ${selectColumn(schema, "opportunities", "slug", "NULL")},
        ${selectColumn(schema, "opportunities", "raw_edge", "NULL")},
        ${selectColumn(schema, "opportunities", "executable_edge", "NULL")},
        ${selectColumn(schema, "opportunities", "status", "'raw_found'")},
        ${selectColumn(schema, "opportunities", "reason", "NULL")},
        ${selectColumn(schema, "opportunities", "token_ids", "NULL")},
        ${selectColumn(schema, "opportunities", "timestamp", "NULL")},
        ${selectColumn(schema, "opportunities", "fillable_usd", "NULL")},
        ${selectColumn(schema, "opportunities", "min_leg_depth_usd", "NULL")},
        ${selectColumn(schema, "opportunities", "leg_count", "NULL")},
        ${selectColumn(schema, "opportunities", "executable_sum", "NULL")},
        ${selectColumn(schema, "opportunities", "fee_adjusted_edge", "NULL")}
      FROM opportunities
      `,
    )
    .all();

  return rows.map((row) => ({
    id: row.id ?? "",
    strategy: row.strategy ?? "unknown",
    slug: row.slug,
    rawEdge: finiteOrNull(row.raw_edge),
    executableEdge: finiteOrNull(row.executable_edge),
    status: row.status ?? "raw_found",
    reason: row.reason,
    tokenIds: row.token_ids,
    timestamp: finiteOrNull(row.timestamp),
    fillableUsd: finiteOrNull(row.fillable_usd),
    minLegDepthUsd: finiteOrNull(row.min_leg_depth_usd),
    legCount: finiteOrNull(row.leg_count),
    executableSum: finiteOrNull(row.executable_sum),
    feeAdjustedEdge: finiteOrNull(row.fee_adjusted_edge),
  }));
}

function loadPaperTradeRows(
  db: SqliteDatabase,
  schema: SchemaInfo,
): PaperTradeEvaluationRow[] {
  if (!tableExists(schema, "paper_trades")) {
    return [];
  }

  return db
    .prepare<RawPaperTradeRow>(
      `
      SELECT
        ${selectColumn(schema, "paper_trades", "strategy", "'unknown'")},
        ${selectColumn(schema, "paper_trades", "resolved", "0")},
        ${selectColumn(schema, "paper_trades", "pnl", "NULL")},
        ${selectColumn(schema, "paper_trades", "opportunity_id", "NULL")},
        ${selectColumn(schema, "paper_trades", "timestamp", "NULL")}
      FROM paper_trades
      `,
    )
    .all()
    .map((row) => ({
      strategy: row.strategy ?? "unknown",
      resolved: finiteOrNull(row.resolved),
      pnl: finiteOrNull(row.pnl),
      opportunityId: row.opportunity_id,
      timestamp: finiteOrNull(row.timestamp),
    }));
}

function loadScanCycleRows(
  db: SqliteDatabase,
  schema: SchemaInfo,
): ScanCycleEvaluationRow[] {
  if (!tableExists(schema, "scan_cycles")) {
    return [];
  }

  return db
    .prepare<RawScanCycleRow>(
      `
      SELECT
        ${selectColumn(schema, "scan_cycles", "timestamp", "NULL")},
        ${selectColumn(schema, "scan_cycles", "success", "NULL")},
        ${selectColumn(schema, "scan_cycles", "opportunities", "NULL")},
        ${selectColumn(schema, "scan_cycles", "paper_trades", "NULL")},
        ${selectColumn(schema, "scan_cycles", "skipped_duplicates", "NULL")},
        ${selectColumn(schema, "scan_cycles", "rejected_opportunities", "NULL")}
      FROM scan_cycles
      `,
    )
    .all()
    .map((row) => ({
      timestamp: finiteOrNull(row.timestamp),
      success: finiteOrNull(row.success),
      opportunities: finiteOrNull(row.opportunities),
      paperTrades: finiteOrNull(row.paper_trades),
      skippedDuplicates: finiteOrNull(row.skipped_duplicates),
      rejectedOpportunities: finiteOrNull(row.rejected_opportunities),
    }));
}

function loadScannerRunRows(
  db: SqliteDatabase,
  schema: SchemaInfo,
): ScannerRunEvaluationRow[] {
  if (!tableExists(schema, "scanner_runs")) {
    return [];
  }

  return db
    .prepare<RawScannerRunRow>(
      `
      SELECT
        ${selectColumn(schema, "scanner_runs", "strategy", "'unknown'")},
        ${selectColumn(schema, "scanner_runs", "timestamp", "NULL")},
        ${selectColumn(schema, "scanner_runs", "raw_opportunities", "NULL")},
        ${selectColumn(schema, "scanner_runs", "validated_opportunities", "NULL")},
        ${selectColumn(schema, "scanner_runs", "rejected_opportunities", "NULL")},
        ${selectColumn(schema, "scanner_runs", "dedupe_skips", "NULL")},
        ${selectColumn(schema, "scanner_runs", "paper_trades", "NULL")}
      FROM scanner_runs
      `,
    )
    .all()
    .map((row) => ({
      strategy: row.strategy ?? "unknown",
      timestamp: finiteOrNull(row.timestamp),
      rawOpportunities: finiteOrNull(row.raw_opportunities),
      validatedOpportunities: finiteOrNull(row.validated_opportunities),
      rejectedOpportunities: finiteOrNull(row.rejected_opportunities),
      dedupeSkips: finiteOrNull(row.dedupe_skips),
      paperTrades: finiteOrNull(row.paper_trades),
    }));
}

function loadPaperFireDedupeRows(
  db: SqliteDatabase,
  schema: SchemaInfo,
): PaperFireDedupeEvaluationRow[] {
  if (!tableExists(schema, "paper_fire_dedup")) {
    return [];
  }

  return db
    .prepare<RawPaperFireDedupeRow>(
      `
      SELECT
        ${selectColumn(schema, "paper_fire_dedup", "strategy", "'unknown'")},
        ${selectColumn(schema, "paper_fire_dedup", "fired_at", "NULL")}
      FROM paper_fire_dedup
      `,
    )
    .all()
    .map((row) => ({
      strategy: row.strategy ?? "unknown",
      firedAt: finiteOrNull(row.fired_at),
    }));
}

function loadPaperDedupeSkipRows(
  db: SqliteDatabase,
  schema: SchemaInfo,
): PaperDedupeSkipEvaluationRow[] {
  if (!tableExists(schema, "paper_dedupe_skips")) {
    return [];
  }

  return db
    .prepare<RawPaperDedupeSkipRow>(
      `
      SELECT
        ${selectColumn(schema, "paper_dedupe_skips", "strategy", "'unknown'")},
        ${selectColumn(schema, "paper_dedupe_skips", "skipped_at", "NULL")}
      FROM paper_dedupe_skips
      `,
    )
    .all()
    .map((row) => ({
      strategy: row.strategy ?? "unknown",
      skippedAt: finiteOrNull(row.skipped_at),
    }));
}

function writeReports(
  basePath: string,
  report: StrategyEvaluationReport,
): void {
  mkdirSync(dirname(basePath), { recursive: true });
  writeFileSync(`${basePath}.json`, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(`${basePath}.md`, renderMarkdown(report), "utf8");
  writeFileSync(`${basePath}.html`, renderHtml(report), "utf8");
}

function renderMarkdown(report: StrategyEvaluationReport): string {
  return [
    `# Strategy Evaluation - ${report.generatedAt.slice(0, 10)}`,
    "",
    `Database: \`${report.dbPath}\``,
    "",
    "## A. Run Summary",
    "",
    `- Start time: ${report.runSummary.startTime ?? "unavailable"}`,
    `- End time: ${report.runSummary.endTime ?? "unavailable"}`,
    `- Duration hours: ${formatNumber(report.runSummary.durationHours)}`,
    `- Strategies found: ${report.runSummary.strategiesFound.join(", ") || "none"}`,
    `- Scan cycles: ${formatAvailability(report.runSummary.scanCycles, (value) => String(value.total))}`,
    "",
    "## B. Opportunity Funnel pro Strategie",
    "",
    renderFunnelTable(report.funnel),
    "",
    "## C. Rejection Reasons",
    "",
    renderRejectionTable(report.rejectionReasons),
    "",
    "## D. Edge Quality",
    "",
    renderEdgeQualityTable(report.edgeQuality),
    "",
    "## E. Capacity / Depth",
    "",
    renderCapacityTable(report.capacity),
    "",
    "### Top 20 by executable_edge_bps",
    "",
    renderTopOpportunityTable(report.topByExecutableEdge),
    "",
    "### Top 20 by executable_edge_bps * fillable_usd",
    "",
    report.topByExecutableEdgeTimesFillableUsd.available
      ? renderTopOpportunityTable(
          report.topByExecutableEdgeTimesFillableUsd.value,
        )
      : `_${report.topByExecutableEdgeTimesFillableUsd.reason}_`,
    "",
    "## F. Time Analysis",
    "",
    `- Opportunities per hour: ${formatNumber(report.timeAnalysis.opportunitiesPerHour)}`,
    `- Validated per hour: ${formatNumber(report.timeAnalysis.validatedPerHour)}`,
    `- Rejected per hour: ${formatNumber(report.timeAnalysis.rejectedPerHour)}`,
    "",
    "## G. Paper Trades",
    "",
    renderPaperTradeTable(report.paperTrades),
    "",
    "## H. Verdict",
    "",
    renderVerdictTable(report.verdicts),
    "",
    "## Data Quality Warnings",
    "",
    report.dataQualityWarnings.length === 0
      ? "_None_"
      : report.dataQualityWarnings.map((warning) => `- ${warning}`).join("\n"),
    "",
    "## Safety Notes",
    "",
    "- No live trading data is modified.",
    "- No external APIs are called.",
    "- PnL and win-rate are not inferred from unresolved paper trades.",
    "- Secrets and environment variables are not printed.",
    "",
  ].join("\n");
}

function renderHtml(report: StrategyEvaluationReport): string {
  const funnelTotals = [
    {
      label: "raw_found",
      value: sumNumbers(report.funnel.map((row) => row.rawFound)),
    },
    {
      label: "validated",
      value: sumNumbers(report.funnel.map((row) => row.validated)),
    },
    {
      label: "rejected",
      value: sumNumbers(report.funnel.map((row) => row.rejected)),
    },
    {
      label: "paper_fired",
      value: sumNumbers(report.funnel.map((row) => row.paperFired)),
    },
  ];
  const reasonTotals = groupReasonTotals(report.rejectionReasons);
  const executableEdges = report.topByExecutableEdge
    .map((row) => row.executableEdgeBps)
    .filter(isFiniteNumber);
  const comparison = report.funnel.map((row) => ({
    label: row.strategy,
    value: row.validated,
  }));

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>Strategy Evaluation ${escapeHtml(report.generatedAt.slice(0, 10))}</title>`,
    "<style>",
    "body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:24px;background:#f7f8fa;color:#171717}",
    "main{max-width:1180px;margin:0 auto}",
    "section{background:#fff;border:1px solid #d9dee7;border-radius:8px;margin:16px 0;padding:18px}",
    "h1,h2{margin:0 0 12px}",
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}",
    ".metric{font-size:28px;font-weight:700}",
    "table{border-collapse:collapse;width:100%;font-size:13px}",
    "th,td{border-bottom:1px solid #e6e9ef;padding:8px;text-align:left}",
    "th{text-transform:uppercase;font-size:11px;color:#555}",
    "svg{width:100%;height:auto;border:1px solid #e6e9ef;border-radius:6px;background:#fff}",
    ".note{color:#5c6470}",
    "</style>",
    "</head>",
    "<body><main>",
    `<h1>Strategy Evaluation - ${escapeHtml(report.generatedAt.slice(0, 10))}</h1>`,
    '<section class="grid">',
    metricCard("Strategies", String(report.runSummary.strategiesFound.length)),
    metricCard("Duration hours", formatNumber(report.runSummary.durationHours)),
    metricCard(
      "Scan cycles",
      formatAvailability(report.runSummary.scanCycles, (value) =>
        String(value.total),
      ),
    ),
    metricCard(
      "Paper trades",
      String(sumNumbers(report.paperTrades.map((row) => row.count))),
    ),
    "</section>",
    chartSection("Opportunity funnel", renderBarChart(funnelTotals)),
    chartSection(
      "Rejection reasons",
      renderBarChart(reasonTotals.slice(0, 12)),
    ),
    chartSection(
      "Executable edge histogram",
      renderHistogram(executableEdges, "bps"),
    ),
    chartSection(
      "Edge vs fillable_usd",
      report.topByExecutableEdgeTimesFillableUsd.available
        ? renderScatterPlot(report.topByExecutableEdgeTimesFillableUsd.value)
        : `<p class="note">${escapeHtml(report.topByExecutableEdgeTimesFillableUsd.reason)}</p>`,
    ),
    chartSection(
      "Opportunities per hour",
      renderLineChart(
        report.timeAnalysis.hourly.map((row) => ({
          label: row.hour,
          value: row.opportunities,
        })),
      ),
    ),
    chartSection("Strategy comparison", renderBarChart(comparison)),
    "<section>",
    "<h2>Verdicts</h2>",
    renderHtmlTable(
      ["Strategy", "Verdict", "Reason"],
      report.verdicts.map((row) => [row.strategy, row.verdict, row.reason]),
    ),
    "</section>",
    `<script type="application/json" id="strategy-evaluation-data">${escapeHtml(JSON.stringify(report))}</script>`,
    "</main></body></html>",
  ].join("\n");
}

function renderFunnelTable(rows: FunnelMetrics[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | raw_found | validated | rejected | paper_fired | dedupe_skipped | validated_rate | rejected_rate | paper_fired_rate |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${row.rawFound} | ${row.validated} | ${row.rejected} | ${row.paperFired} | ${row.dedupeSkipped} | ${formatPercent(row.validatedRate)} | ${formatPercent(row.rejectedRate)} | ${formatPercent(row.paperFiredRate)} |`,
    ),
  ].join("\n");
}

function renderRejectionTable(rows: RejectionReasonMetric[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Reason | Count |",
    "| --- | --- | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${escapeMd(row.reason)} | ${row.count} |`,
    ),
  ].join("\n");
}

function renderEdgeQualityTable(rows: EdgeQualityMetrics[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | avg raw_edge_bps | median raw_edge_bps | avg executable_edge_bps | median executable_edge_bps | min executable_edge_bps | max executable_edge_bps | fee_adjusted_edge_bps |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${formatNumber(row.rawEdgeBps.avg)} | ${formatNumber(row.rawEdgeBps.median)} | ${formatNumber(row.executableEdgeBps.avg)} | ${formatNumber(row.executableEdgeBps.median)} | ${formatNumber(row.executableEdgeBps.min)} | ${formatNumber(row.executableEdgeBps.max)} | ${formatAvailability(row.feeAdjustedEdgeBps, (value) => formatNumber(value.avg))} |`,
    ),
  ].join("\n");
}

function renderCapacityTable(rows: CapacityMetrics[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | avg fillable_usd | median fillable_usd | min_leg_depth_usd |",
    "| --- | ---: | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${formatAvailability(row.fillableUsd, (value) => formatNumber(value.avg))} | ${formatAvailability(row.fillableUsd, (value) => formatNumber(value.median))} | ${formatAvailability(row.minLegDepthUsd, (value) => formatNumber(value.min))} |`,
    ),
  ].join("\n");
}

function renderTopOpportunityTable(rows: TopOpportunityMetric[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Slug | executable_edge_bps | fillable_usd | min_leg_depth_usd | leg_count | executable_sum | edge_x_fillable | Status | Reason | Timestamp |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${escapeMd(row.slug ?? "")} | ${formatNumber(row.executableEdgeBps)} | ${formatNumber(row.fillableUsd)} | ${formatNumber(row.minLegDepthUsd)} | ${formatNumber(row.legCount)} | ${formatNumber(row.executableSum)} | ${formatNumber(row.executableEdgeTimesFillableUsd)} | ${escapeMd(row.status)} | ${escapeMd(row.reason ?? "")} | ${row.timestamp === null ? "unavailable" : new Date(row.timestamp).toISOString()} |`,
    ),
  ].join("\n");
}

function renderPaperTradeTable(rows: PaperTradeMetrics[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Count | Unresolved | Resolved | Note |",
    "| --- | ---: | ---: | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${row.count} | ${row.unresolved} | ${row.resolved} | ${escapeMd(row.note)} |`,
    ),
  ].join("\n");
}

function renderVerdictTable(rows: StrategyVerdictMetric[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Verdict | Reason |",
    "| --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeMd(row.strategy)} | ${row.verdict} | ${escapeMd(row.reason)} |`,
    ),
  ].join("\n");
}

function renderBarChart(rows: Array<{ label: string; value: number }>): string {
  if (rows.length === 0) {
    return '<p class="note">No data available.</p>';
  }

  const width = 760;
  const barHeight = 26;
  const gap = 10;
  const left = 190;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const height = rows.length * (barHeight + gap) + 34;
  const bars = rows
    .map((row, index) => {
      const y = 24 + index * (barHeight + gap);
      const barWidth = Math.max(
        1,
        (row.value / maxValue) * (width - left - 80),
      );

      return [
        `<text x="8" y="${y + 18}" font-size="12">${escapeHtml(row.label)}</text>`,
        `<rect x="${left}" y="${y}" width="${barWidth}" height="${barHeight}" fill="#2f6fed"></rect>`,
        `<text x="${left + barWidth + 8}" y="${y + 18}" font-size="12">${row.value}</text>`,
      ].join("");
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" role="img">${bars}</svg>`;
}

function renderHistogram(values: number[], suffix: string): string {
  if (values.length === 0) {
    return '<p class="note">No executable edge data available.</p>';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const bucketCount = Math.min(10, Math.max(1, values.length));
  const span = max - min || 1;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    label: `${round(min + (span / bucketCount) * index, 1)} ${suffix}`,
    value: 0,
  }));

  for (const value of values) {
    const index = Math.min(
      bucketCount - 1,
      Math.floor(((value - min) / span) * bucketCount),
    );
    const bucket = buckets[index];

    if (bucket) {
      bucket.value += 1;
    }
  }

  return renderBarChart(buckets);
}

function renderScatterPlot(rows: TopOpportunityMetric[]): string {
  const points = rows.filter(
    (row) => row.executableEdgeBps !== null && row.fillableUsd !== null,
  );

  if (points.length === 0) {
    return '<p class="note">No fillable depth data available.</p>';
  }

  const width = 760;
  const height = 360;
  const pad = 48;
  const maxX = Math.max(...points.map((row) => row.fillableUsd ?? 0), 1);
  const minY = Math.min(...points.map((row) => row.executableEdgeBps ?? 0));
  const maxY = Math.max(...points.map((row) => row.executableEdgeBps ?? 0));
  const ySpan = maxY - minY || 1;
  const circles = points
    .map((row) => {
      const x = pad + ((row.fillableUsd ?? 0) / maxX) * (width - pad * 2);
      const y =
        height -
        pad -
        (((row.executableEdgeBps ?? 0) - minY) / ySpan) * (height - pad * 2);

      return `<circle cx="${x}" cy="${y}" r="4" fill="#d1495b"><title>${escapeHtml(row.strategy)}</title></circle>`;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" role="img"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#99a"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#99a"/>${circles}<text x="${width / 2 - 60}" y="${height - 10}" font-size="12">fillable_usd</text><text x="8" y="24" font-size="12">edge bps</text></svg>`;
}

function renderLineChart(
  rows: Array<{ label: string; value: number }>,
): string {
  if (rows.length === 0) {
    return '<p class="note">No hourly data available.</p>';
  }

  const width = 760;
  const height = 300;
  const pad = 44;
  const maxY = Math.max(...rows.map((row) => row.value), 1);
  const stepX =
    rows.length === 1 ? 0 : (width - pad * 2) / Math.max(1, rows.length - 1);
  const points = rows.map((row, index) => {
    const x = pad + stepX * index;
    const y = height - pad - (row.value / maxY) * (height - pad * 2);

    return { x, y, label: row.label, value: row.value };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const circles = points
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="3" fill="#2f6fed"><title>${escapeHtml(point.label)}: ${point.value}</title></circle>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" role="img"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#99a"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#99a"/><path d="${path}" fill="none" stroke="#2f6fed" stroke-width="3"/>${circles}</svg>`;
}

function renderHtmlTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '<p class="note">No data available.</p>';
  }

  return [
    "<table><thead><tr>",
    ...headers.map((header) => `<th>${escapeHtml(header)}</th>`),
    "</tr></thead><tbody>",
    ...rows.map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    ),
    "</tbody></table>",
  ].join("");
}

function chartSection(title: string, chart: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${chart}</section>`;
}

function metricCard(title: string, value: string): string {
  return `<section><h2>${escapeHtml(title)}</h2><div class="metric">${escapeHtml(value)}</div></section>`;
}

function toTopOpportunityMetric(
  row: OpportunityEvaluationRow,
): TopOpportunityMetric {
  const executableEdgeBps = edgeToBps(row.executableEdge);

  return {
    strategy: row.strategy,
    slug: row.slug,
    rawEdgeBps: edgeToBps(row.rawEdge),
    executableEdgeBps,
    fillableUsd: row.fillableUsd,
    minLegDepthUsd: row.minLegDepthUsd,
    legCount: row.legCount,
    executableSum: row.executableSum,
    executableEdgeTimesFillableUsd:
      executableEdgeBps === null || row.fillableUsd === null
        ? null
        : round(executableEdgeBps * row.fillableUsd, 2),
    status: row.status,
    reason: row.reason,
    timestamp: row.timestamp,
  };
}

function summarizeNumbers(values: Array<number | null>): NumberSummary {
  const finite = values.filter(isFiniteNumber);

  if (finite.length === 0) {
    return {
      avg: null,
      median: null,
      min: null,
      max: null,
    };
  }

  return {
    avg: round(sumNumbers(finite) / finite.length, 2),
    median: median(finite),
    ...minMax(finite),
  };
}

function minMax(values: number[]): { min: number | null; max: number | null } {
  let min: number | null = null;
  let max: number | null = null;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }

    min = min === null ? value : Math.min(min, value);
    max = max === null ? value : Math.max(max, value);
  }

  return { min, max };
}

function collectStrategies(
  opportunities: OpportunityEvaluationRow[],
  paperTrades: PaperTradeEvaluationRow[],
  dedupeSkips: PaperDedupeSkipEvaluationRow[] = [],
  scannerRuns: ScannerRunEvaluationRow[] = [],
): string[] {
  return [
    ...new Set(
      [...opportunities, ...paperTrades, ...dedupeSkips, ...scannerRuns].map(
        (row) => row.strategy,
      ),
    ),
  ]
    .filter((strategy) => strategy.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function selectColumn(
  schema: SchemaInfo,
  tableName: string,
  columnName: string,
  fallbackSql: string,
): string {
  return columnExists(schema, tableName, columnName)
    ? columnName
    : `${fallbackSql} AS ${columnName}`;
}

function tableExists(schema: SchemaInfo, tableName: string): boolean {
  return schema[tableName]?.exists ?? false;
}

function countRows(db: SqliteDatabase, tableName: string): number {
  return (
    db.prepare<CountRow>(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
      ?.count ?? 0
  );
}

function countStatus(rows: OpportunityEvaluationRow[], status: string): number {
  return rows.filter((row) => row.status === status).length;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator <= 0 ? null : round(numerator / denominator, 4);
}

function sumNumbers(values: Array<number | null>): number {
  return values.reduce<number>(
    (total, value) =>
      total + (value === null || !Number.isFinite(value) ? 0 : value),
    0,
  );
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function available<T>(value: T): MetricAvailability<T> {
  return {
    available: true,
    value,
  };
}

function unavailable<T = never>(reason: string): MetricAvailability<T> {
  return {
    available: false,
    reason,
  };
}

function emptySchema(): SchemaInfo {
  return Object.fromEntries(
    REPORT_TABLES.map((tableName) => [
      tableName,
      { exists: false, columns: [] },
    ]),
  );
}

function emptyEdgeQuality(strategy: string): EdgeQualityMetrics {
  return {
    strategy,
    rawEdgeBps: summarizeNumbers([]),
    executableEdgeBps: summarizeNumbers([]),
    feeAdjustedEdgeBps: unavailable(
      "opportunities.fee_adjusted_edge column unavailable",
    ),
  };
}

function isHardRejectionReason(reason: string | undefined): boolean {
  return [
    "partial_basket_invalid",
    "not_fillable",
    "orderbook_error",
    "missing_fill_price",
    "non_positive_executable_edge",
  ].includes(reason ?? "");
}

function groupReasonTotals(
  rows: RejectionReasonMetric[],
): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + row.count);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : String(value);
}

function formatPercent(value: number | null): string {
  return value === null ? "unavailable" : `${round(value * 100, 2)}%`;
}

function formatAvailability<T>(
  metric: MetricAvailability<T>,
  format: (value: T) => string,
): string {
  return metric.available ? format(metric.value) : metric.reason;
}

function escapeMd(value: string): string {
  return value.replaceAll("|", "\\|");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function printConsoleSummary(
  report: StrategyEvaluationReport,
  reportBasePath: string,
): void {
  console.log(`Strategy evaluation generated: ${report.generatedAt}`);
  console.log(`Reports: ${reportBasePath}.md`);
  console.log(`Reports: ${reportBasePath}.html`);
  console.log(`Reports: ${reportBasePath}.json`);
  console.log("Verdicts:");

  for (const verdict of report.verdicts) {
    console.log(`- ${verdict.strategy}: ${verdict.verdict}`);
  }
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  const cliOptions = parseArgs(process.argv.slice(2));

  runStrategyEvaluation(cliOptions.dbPath, cliOptions.reportDate).catch(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`strategy evaluation failed: ${message}`);
      process.exitCode = 1;
    },
  );
}

function parseArgs(argv: string[]): StrategyEvaluationCliOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const dateArg = argv.find((arg) => arg.startsWith("--date="));

  return {
    dbPath: dbArg?.slice("--db=".length),
    reportDate: dateArg?.slice("--date=".length),
  };
}
