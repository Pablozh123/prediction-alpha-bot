import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

type SqliteDatabase = {
  prepare<T = unknown>(sql: string): {
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | undefined;
  };
  close(): void;
};

type DatabaseConstructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }
) => SqliteDatabase;

type CountRow = {
  count: number;
};

type MetricRow = {
  strategy: string;
  count: number;
};

type DurationMetricRow = {
  capital_lock_class: string | null;
  status: string;
  count: number;
};

type ReasonRow = {
  reason: string | null;
  count: number;
};

type AverageRow = {
  average: number | null;
};

type TopOpportunityRow = {
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
  capital_lock_class: string | null;
  status: string;
  reason: string | null;
  timestamp: number;
};

type ScanCycleSummaryRow = {
  total: number;
  successful: number;
  failed: number;
};

export type RunPaperReportOptions = {
  dbPath?: string;
  reportDate?: string;
};

const Database = require("better-sqlite3") as DatabaseConstructor;

export function runPaperReport(options: RunPaperReportOptions = {}): string {
  const dbPath = resolve(options.dbPath ?? process.env.DATABASE_PATH ?? "logs/trades.db");
  const reportDate = options.reportDate ?? formatDate(new Date());
  const reportPath = resolve("docs", "reports", `paper-report-${reportDate}.md`);

  if (!existsSync(dbPath)) {
    const missingReport = [
      `# Paper Run Report - ${reportDate}`,
      "",
      `Database: \`${dbPath}\``,
      "",
      "Status: database not found.",
      ""
    ].join("\n");

    writeReport(missingReport, reportPath);

    return missingReport;
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const scanCycles = getScanCycleSummary(db);
    const rawByStrategy = groupedCount(
      db,
      "scanner_runs",
      `
      SELECT strategy, SUM(raw_opportunities) AS count
      FROM scanner_runs
      GROUP BY strategy
      ORDER BY count DESC
      `
    );
    const validatedByStrategy = groupedCount(
      db,
      "opportunities",
      `
      SELECT strategy, COUNT(*) AS count
      FROM opportunities
      WHERE status IN ('validated', 'paper_fired')
      GROUP BY strategy
      ORDER BY count DESC
      `
    );
    const rejectedByStrategy = groupedCount(
      db,
      "opportunities",
      `
      SELECT strategy, COUNT(*) AS count
      FROM opportunities
      WHERE status = 'rejected'
        AND COALESCE(reason, '') != 'duplicate_within_cooldown'
      GROUP BY strategy
      ORDER BY count DESC
      `
    );
    const rejectionReasons = tableExists(db, "opportunities")
      ? db
          .prepare<ReasonRow>(
            `
            SELECT reason, COUNT(*) AS count
            FROM opportunities
            WHERE status = 'rejected'
              AND COALESCE(reason, '') != 'duplicate_within_cooldown'
            GROUP BY reason
            ORDER BY count DESC, reason ASC
            `
          )
          .all()
      : [];
    const paperTradesByStrategy = groupedCount(
      db,
      "paper_trades",
      "SELECT strategy, COUNT(*) AS count FROM paper_trades GROUP BY strategy ORDER BY count DESC"
    );
    const dedupeSkips = countRows(db, "paper_dedupe_skips");
    const legacyDuplicateRejections = tableExists(db, "opportunities")
      ? countWhere(
          db,
          "opportunities",
          "status = 'rejected' AND reason = 'duplicate_within_cooldown'"
        )
      : 0;
    const averageRawEdge = averageColumn(db, "opportunities", "raw_edge");
    const averageExecutableEdge = averageColumn(
      db,
      "opportunities",
      "executable_edge"
    );
    const averageFillableUsd = averageColumn(db, "opportunities", "fillable_usd");
    const averageMinLegDepthUsd = averageColumn(
      db,
      "opportunities",
      "min_leg_depth_usd"
    );
    const averageFeeAdjustedEdge = averageColumn(
      db,
      "opportunities",
      "fee_adjusted_edge"
    );
    const averageEdgeBps = averageColumn(db, "opportunities", "edge_bps");
    const averageRoiBps = averageColumn(db, "opportunities", "roi_bps");
    const averageMaxPositiveBasketCostUsd = averageColumn(
      db,
      "opportunities",
      "max_positive_basket_cost_usd"
    );
    const topOpportunities = getTopOpportunities(db);
    const durationBreakdown = getDurationBreakdown(db);
    const cleanShortArbs = getOpportunitySlice(
      db,
      "status = 'paper_fired' AND capital_lock_class = 'short'",
      "executable_edge DESC, timestamp DESC",
    );
    const longDurationWatch = getOpportunitySlice(
      db,
      "status = 'rejected' AND reason IN ('duration_too_long_for_short_arb', 'unknown_duration_for_short_arb')",
      "timestamp DESC",
    );
    const nearResolutionWatch = getOpportunitySlice(
      db,
      "strategy = 'clear_win_watch'",
      "timestamp DESC",
    );
    const unvalidatedPaperTrades = countUnvalidatedPaperTrades(db);
    const scannerRunsByStrategy = groupedCount(
      db,
      "scanner_runs",
      "SELECT strategy, COUNT(*) AS count FROM scanner_runs GROUP BY strategy ORDER BY strategy ASC"
    );

    const report = renderReport({
      averageExecutableEdge,
      averageEdgeBps,
      averageFeeAdjustedEdge,
      averageFillableUsd,
      averageMinLegDepthUsd,
      averageMaxPositiveBasketCostUsd,
      averageRoiBps,
      averageRawEdge,
      dbPath,
      dedupeSkips,
      cleanShortArbs,
      durationBreakdown,
      legacyDuplicateRejections,
      longDurationWatch,
      nearResolutionWatch,
      paperTradesByStrategy,
      rawByStrategy,
      rejectedByStrategy,
      rejectionReasons,
      reportDate,
      scanCycles,
      scannerRunsByStrategy,
      topOpportunities,
      unvalidatedPaperTrades,
      validatedByStrategy
    });

    writeReport(report, reportPath);

    return report;
  } finally {
    db.close();
  }
}

function renderReport(input: {
  averageExecutableEdge: number | null;
  averageEdgeBps: number | null;
  averageFeeAdjustedEdge: number | null;
  averageFillableUsd: number | null;
  averageMinLegDepthUsd: number | null;
  averageMaxPositiveBasketCostUsd: number | null;
  averageRoiBps: number | null;
  averageRawEdge: number | null;
  dbPath: string;
  dedupeSkips: number;
  cleanShortArbs: TopOpportunityRow[];
  durationBreakdown: DurationMetricRow[];
  legacyDuplicateRejections: number;
  longDurationWatch: TopOpportunityRow[];
  nearResolutionWatch: TopOpportunityRow[];
  paperTradesByStrategy: MetricRow[];
  rawByStrategy: MetricRow[];
  rejectedByStrategy: MetricRow[];
  rejectionReasons: ReasonRow[];
  reportDate: string;
  scanCycles: ScanCycleSummaryRow;
  scannerRunsByStrategy: MetricRow[];
  topOpportunities: TopOpportunityRow[];
  unvalidatedPaperTrades: number;
  validatedByStrategy: MetricRow[];
}): string {
  const lines = [
    `# Paper Run Report - ${input.reportDate}`,
    "",
    `Database: \`${input.dbPath}\``,
    "",
    "## Summary",
    "",
    `- Scan cycles total: ${input.scanCycles.total}`,
    `- Successful scan cycles: ${input.scanCycles.successful}`,
    `- Failed scan cycles: ${input.scanCycles.failed}`,
    `- Dedupe skips: ${input.dedupeSkips}`,
    `- Legacy duplicate rejected rows: ${input.legacyDuplicateRejections}`,
    `- Average raw_edge: ${formatNumber(input.averageRawEdge)}`,
    `- Average executable_edge: ${formatNumber(input.averageExecutableEdge)}`,
    `- Average fillable_usd: ${formatNumber(input.averageFillableUsd)}`,
    `- Average min_leg_depth_usd: ${formatNumber(input.averageMinLegDepthUsd)}`,
    `- Average fee_adjusted_edge: ${formatNumber(input.averageFeeAdjustedEdge)}`,
    `- Average edge_bps: ${formatNumber(input.averageEdgeBps)}`,
    `- Average roi_bps: ${formatNumber(input.averageRoiBps)}`,
    `- Average max_positive_basket_cost_usd: ${formatNumber(input.averageMaxPositiveBasketCostUsd)}`,
    `- Paper trades without validation link: ${input.unvalidatedPaperTrades}`,
    "",
    "## Raw Opportunities By Strategy",
    "",
    renderMetricTable(input.rawByStrategy),
    "",
    "## Validated Opportunities By Strategy",
    "",
    renderMetricTable(input.validatedByStrategy),
    "",
    "## Rejected Opportunities By Strategy",
    "",
    renderMetricTable(input.rejectedByStrategy),
    "",
    "## Rejection Reasons",
    "",
    renderReasonTable(input.rejectionReasons),
    "",
    "## Paper Trades By Strategy",
    "",
    renderMetricTable(input.paperTradesByStrategy),
    "",
    "## Scanner Runs By Strategy",
    "",
    renderMetricTable(input.scannerRunsByStrategy),
    "",
    "## Duration Breakdown",
    "",
    renderDurationMetricTable(input.durationBreakdown),
    "",
    "## Clean Short Arbs",
    "",
    renderOpportunityTable(input.cleanShortArbs),
    "",
    "## Long-Duration Watch",
    "",
    renderOpportunityTable(input.longDurationWatch),
    "",
    "## Near-Resolution Watch",
    "",
    renderOpportunityTable(input.nearResolutionWatch),
    "",
    "## Top 20 Opportunities By Executable Edge",
    "",
    renderOpportunityTable(input.topOpportunities),
    "",
    "## Validation Warning",
    "",
    input.unvalidatedPaperTrades > 0
      ? `WARNING: ${input.unvalidatedPaperTrades} paper trade(s) do not have a recorded opportunity validation link. Treat them as legacy or non-graduation data.`
      : "OK: every paper trade has a recorded opportunity validation link.",
    "",
    "## Notes",
    "",
    "- PnL is not calculated or inferred in this report.",
    "- Live trading data is not used.",
    "- Secrets and environment variables are not printed.",
    ""
  ];

  return lines.join("\n");
}

function writeReport(report: string, reportPath: string): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, "utf8");
  console.log(report);
  console.log(`Report written to: ${reportPath}`);
}

function getScanCycleSummary(db: SqliteDatabase): ScanCycleSummaryRow {
  if (!tableExists(db, "scan_cycles")) {
    return {
      total: 0,
      successful: 0,
      failed: 0
    };
  }

  return (
    db
      .prepare<ScanCycleSummaryRow>(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
        FROM scan_cycles
        `
      )
      .get() ?? {
      total: 0,
      successful: 0,
      failed: 0
    }
  );
}

function groupedCount(
  db: SqliteDatabase,
  tableName: string,
  sql: string
): MetricRow[] {
  if (!tableExists(db, tableName)) {
    return [];
  }

  return db.prepare<MetricRow>(sql).all();
}

function countWhere(
  db: SqliteDatabase,
  tableName: string,
  whereClause: string
): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return (
    db
      .prepare<CountRow>(
        `SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereClause}`
      )
      .get()?.count ?? 0
  );
}

function averageColumn(
  db: SqliteDatabase,
  tableName: string,
  columnName: string
): number | null {
  if (!tableExists(db, tableName) || !columnExists(db, tableName, columnName)) {
    return null;
  }

  return (
    db
      .prepare<AverageRow>(
        `SELECT AVG(${columnName}) AS average FROM ${tableName} WHERE ${columnName} IS NOT NULL`
      )
      .get()?.average ?? null
  );
}

function getTopOpportunities(db: SqliteDatabase): TopOpportunityRow[] {
  if (!tableExists(db, "opportunities")) {
    return [];
  }

  return db
    .prepare<TopOpportunityRow>(
      `
      SELECT
        ${selectColumn(db, "opportunities", "strategy", "'unknown'")},
        ${selectColumn(db, "opportunities", "slug", "NULL")},
        ${selectColumn(db, "opportunities", "raw_edge", "NULL")},
        ${selectColumn(db, "opportunities", "executable_edge", "NULL")},
        ${selectColumn(db, "opportunities", "fillable_usd", "NULL")},
        ${selectColumn(db, "opportunities", "min_leg_depth_usd", "NULL")},
        ${selectColumn(db, "opportunities", "leg_count", "NULL")},
        ${selectColumn(db, "opportunities", "executable_sum", "NULL")},
        ${selectColumn(db, "opportunities", "fee_adjusted_edge", "NULL")},
        ${selectColumn(db, "opportunities", "basket_size_shares", "NULL")},
        ${selectColumn(db, "opportunities", "basket_cost_usd", "NULL")},
        ${selectColumn(db, "opportunities", "basket_payout_usd", "NULL")},
        ${selectColumn(db, "opportunities", "basket_profit_usd", "NULL")},
        ${selectColumn(db, "opportunities", "edge_bps", "NULL")},
        ${selectColumn(db, "opportunities", "roi_bps", "NULL")},
        ${selectColumn(db, "opportunities", "max_positive_basket_shares", "NULL")},
        ${selectColumn(db, "opportunities", "max_positive_basket_cost_usd", "NULL")},
        ${selectColumn(db, "opportunities", "expected_resolution_at", "NULL")},
        ${selectColumn(db, "opportunities", "duration_hours", "NULL")},
        ${selectColumn(db, "opportunities", "capital_lock_class", "NULL")},
        ${selectColumn(db, "opportunities", "status", "'unknown'")},
        ${selectColumn(db, "opportunities", "reason", "NULL")},
        ${selectColumn(db, "opportunities", "timestamp", "0")}
      FROM opportunities
      WHERE executable_edge IS NOT NULL
      ORDER BY executable_edge DESC, timestamp DESC
      LIMIT 20
      `
    )
    .all();
}

function getOpportunitySlice(
  db: SqliteDatabase,
  whereClause: string,
  orderBy: string,
): TopOpportunityRow[] {
  if (
    !tableExists(db, "opportunities") ||
    !columnExists(db, "opportunities", "capital_lock_class")
  ) {
    return [];
  }

  return db
    .prepare<TopOpportunityRow>(
      `
      SELECT
        ${selectColumn(db, "opportunities", "strategy", "'unknown'")},
        ${selectColumn(db, "opportunities", "slug", "NULL")},
        ${selectColumn(db, "opportunities", "raw_edge", "NULL")},
        ${selectColumn(db, "opportunities", "executable_edge", "NULL")},
        ${selectColumn(db, "opportunities", "fillable_usd", "NULL")},
        ${selectColumn(db, "opportunities", "min_leg_depth_usd", "NULL")},
        ${selectColumn(db, "opportunities", "leg_count", "NULL")},
        ${selectColumn(db, "opportunities", "executable_sum", "NULL")},
        ${selectColumn(db, "opportunities", "fee_adjusted_edge", "NULL")},
        ${selectColumn(db, "opportunities", "basket_size_shares", "NULL")},
        ${selectColumn(db, "opportunities", "basket_cost_usd", "NULL")},
        ${selectColumn(db, "opportunities", "basket_payout_usd", "NULL")},
        ${selectColumn(db, "opportunities", "basket_profit_usd", "NULL")},
        ${selectColumn(db, "opportunities", "edge_bps", "NULL")},
        ${selectColumn(db, "opportunities", "roi_bps", "NULL")},
        ${selectColumn(db, "opportunities", "max_positive_basket_shares", "NULL")},
        ${selectColumn(db, "opportunities", "max_positive_basket_cost_usd", "NULL")},
        ${selectColumn(db, "opportunities", "expected_resolution_at", "NULL")},
        ${selectColumn(db, "opportunities", "duration_hours", "NULL")},
        ${selectColumn(db, "opportunities", "capital_lock_class", "NULL")},
        ${selectColumn(db, "opportunities", "status", "'unknown'")},
        ${selectColumn(db, "opportunities", "reason", "NULL")},
        ${selectColumn(db, "opportunities", "timestamp", "0")}
      FROM opportunities
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT 20
      `,
    )
    .all();
}

function getDurationBreakdown(db: SqliteDatabase): DurationMetricRow[] {
  if (
    !tableExists(db, "opportunities") ||
    !columnExists(db, "opportunities", "capital_lock_class")
  ) {
    return [];
  }

  return db
    .prepare<DurationMetricRow>(
      `
      SELECT COALESCE(NULLIF(capital_lock_class, ''), 'unknown') AS capital_lock_class,
        status,
        COUNT(*) AS count
      FROM opportunities
      GROUP BY COALESCE(NULLIF(capital_lock_class, ''), 'unknown'), status
      ORDER BY capital_lock_class ASC, status ASC
      `,
    )
    .all();
}

function countUnvalidatedPaperTrades(db: SqliteDatabase): number {
  if (!tableExists(db, "paper_trades")) {
    return 0;
  }

  if (
    !columnExists(db, "paper_trades", "opportunity_id") ||
    !tableExists(db, "opportunities")
  ) {
    return countRows(db, "paper_trades");
  }

  return (
    db
      .prepare<CountRow>(
        `
        SELECT COUNT(*) AS count
        FROM paper_trades p
        LEFT JOIN opportunities o
          ON o.id = p.opportunity_id
          AND o.status = 'paper_fired'
        WHERE p.opportunity_id IS NULL OR o.id IS NULL
        `
      )
      .get()?.count ?? 0
  );
}

function countRows(db: SqliteDatabase, tableName: string): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return db.prepare<CountRow>(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
    ?.count ?? 0;
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(tableName) !== undefined
  );
}

function columnExists(
  db: SqliteDatabase,
  tableName: string,
  columnName: string
): boolean {
  if (!tableExists(db, tableName)) {
    return false;
  }

  return db
    .prepare<{ name: string }>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function selectColumn(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  fallbackSql: string
): string {
  return columnExists(db, tableName, columnName)
    ? columnName
    : `${fallbackSql} AS ${columnName}`;
}

function renderMetricTable(rows: MetricRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Count |",
    "| --- | ---: |",
    ...rows.map((row) => `| ${escapeCell(row.strategy)} | ${row.count} |`)
  ].join("\n");
}

function renderReasonTable(rows: ReasonRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Reason | Count |",
    "| --- | ---: |",
    ...rows.map(
      (row) => `| ${escapeCell(row.reason ?? "unknown")} | ${row.count} |`
    )
  ].join("\n");
}

function renderDurationMetricTable(rows: DurationMetricRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Capital Lock | Status | Count |",
    "| --- | --- | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.capital_lock_class ?? "unknown")} | ${escapeCell(row.status)} | ${row.count} |`,
    ),
  ].join("\n");
}

function renderOpportunityTable(rows: TopOpportunityRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Slug | Raw Edge | Executable Edge | Edge bps | ROI bps | Duration h | Lock | Basket Cost | Basket Profit | Max Positive Cost | Status | Reason | Timestamp |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.strategy)} | ${escapeCell(row.slug ?? "")} | ${formatNumber(row.raw_edge)} | ${formatNumber(row.executable_edge)} | ${formatNumber(row.edge_bps)} | ${formatNumber(row.roi_bps)} | ${formatNumber(row.duration_hours)} | ${escapeCell(row.capital_lock_class ?? "")} | ${formatNumber(row.basket_cost_usd)} | ${formatNumber(row.basket_profit_usd)} | ${formatNumber(row.max_positive_basket_cost_usd)} | ${escapeCell(row.status)} | ${escapeCell(row.reason ?? "")} | ${row.timestamp} |`
    )
  ].join("\n");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(6);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): RunPaperReportOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const dateArg = argv.find((arg) => arg.startsWith("--date="));

  return {
    dbPath: dbArg?.slice("--db=".length),
    reportDate: dateArg?.slice("--date=".length)
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runPaperReport(parseArgs(process.argv.slice(2)));
}
