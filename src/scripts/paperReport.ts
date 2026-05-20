import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

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
  status: string;
  reason: string | null;
  timestamp: number;
};

type ScanCycleSummaryRow = {
  total: number;
  successful: number;
  failed: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const dbPath = resolve("logs", "trades.db");
const reportDate = formatDate(new Date());
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

  writeReport(missingReport);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

try {
  const scanCycles = getScanCycleSummary(db);
  const rawByStrategy = groupedCount(
    db,
    "opportunities",
    "SELECT strategy, COUNT(*) AS count FROM opportunities GROUP BY strategy ORDER BY count DESC"
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
  const dedupeSkips = tableExists(db, "opportunities")
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
  const topOpportunities = getTopOpportunities(db);
  const unvalidatedPaperTrades = countUnvalidatedPaperTrades(db);

  const report = renderReport({
    averageExecutableEdge,
    averageRawEdge,
    dedupeSkips,
    paperTradesByStrategy,
    rawByStrategy,
    rejectedByStrategy,
    rejectionReasons,
    scanCycles,
    topOpportunities,
    unvalidatedPaperTrades,
    validatedByStrategy
  });

  writeReport(report);
} finally {
  db.close();
}

function renderReport(input: {
  averageExecutableEdge: number | null;
  averageRawEdge: number | null;
  dedupeSkips: number;
  paperTradesByStrategy: MetricRow[];
  rawByStrategy: MetricRow[];
  rejectedByStrategy: MetricRow[];
  rejectionReasons: ReasonRow[];
  scanCycles: ScanCycleSummaryRow;
  topOpportunities: TopOpportunityRow[];
  unvalidatedPaperTrades: number;
  validatedByStrategy: MetricRow[];
}): string {
  const lines = [
    `# Paper Run Report - ${reportDate}`,
    "",
    `Database: \`${dbPath}\``,
    "",
    "## Summary",
    "",
    `- Scan cycles total: ${input.scanCycles.total}`,
    `- Successful scan cycles: ${input.scanCycles.successful}`,
    `- Failed scan cycles: ${input.scanCycles.failed}`,
    `- Dedupe skips: ${input.dedupeSkips}`,
    `- Average raw_edge: ${formatNumber(input.averageRawEdge)}`,
    `- Average executable_edge: ${formatNumber(input.averageExecutableEdge)}`,
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

function writeReport(report: string): void {
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
        strategy,
        slug,
        raw_edge,
        executable_edge,
        status,
        reason,
        timestamp
      FROM opportunities
      WHERE executable_edge IS NOT NULL
      ORDER BY executable_edge DESC, timestamp DESC
      LIMIT 20
      `
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

function renderOpportunityTable(rows: TopOpportunityRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Slug | Raw Edge | Executable Edge | Status | Reason | Timestamp |",
    "| --- | --- | ---: | ---: | --- | --- | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.strategy)} | ${escapeCell(row.slug ?? "")} | ${formatNumber(row.raw_edge)} | ${formatNumber(row.executable_edge)} | ${escapeCell(row.status)} | ${escapeCell(row.reason ?? "")} | ${row.timestamp} |`
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
