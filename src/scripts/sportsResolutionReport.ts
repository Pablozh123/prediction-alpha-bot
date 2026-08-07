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
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

type CountRow = {
  count: number;
};

type StatusRow = {
  key: string;
  count: number;
};

type WatchRow = {
  sports_slug: string;
  market_slug: string | null;
  winning_team: string | null;
  final_score: string | null;
  market_price: number | null;
  best_ask: number | null;
  expected_edge: number | null;
  validation_status: string;
  reason: string | null;
  timestamp: number;
};

export type SportsResolutionReportOptions = {
  dbPath?: string;
  reportDate?: string;
};

const Database = require("better-sqlite3") as DatabaseConstructor;

export function runSportsResolutionReport(
  options: SportsResolutionReportOptions = {},
): string {
  const dbPath = resolve(options.dbPath ?? process.env.DATABASE_PATH ?? "logs/trades.db");
  const reportDate = options.reportDate ?? new Date().toISOString().slice(0, 10);
  const reportPath = resolve(
    "docs",
    "reports",
    `sports-resolution-report-${reportDate}.md`,
  );

  if (!existsSync(dbPath)) {
    const missing = [
      `# Sports Resolution Sniping Report - ${reportDate}`,
      "",
      `Database: \`${dbPath}\``,
      "",
      "Status: database not found.",
      "",
    ].join("\n");

    writeReport(missing, reportPath);
    return missing;
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const report = renderReport({
      dbPath,
      mappingStatus: groupedCount(db, "sports_slug_mappings", "mapping_status"),
      paperTrades: countWhere(
        db,
        "paper_trades",
        "strategy = 'sports_resolution_snipe'",
      ),
      recentWatches: recentWatches(db),
      reportDate,
      sportsTicks: countRows(db, "sports_ticks"),
      watchReasons: groupedCount(db, "sports_resolution_watch", "reason"),
      watches: countRows(db, "sports_resolution_watch"),
    });

    writeReport(report, reportPath);
    return report;
  } finally {
    db.close();
  }
}

function renderReport(input: {
  dbPath: string;
  mappingStatus: StatusRow[];
  paperTrades: number;
  recentWatches: WatchRow[];
  reportDate: string;
  sportsTicks: number;
  watchReasons: StatusRow[];
  watches: number;
}): string {
  return [
    `# Sports Resolution Sniping Report - ${input.reportDate}`,
    "",
    `Database: \`${input.dbPath}\``,
    "",
    "## Kurz erklaert",
    "",
    "Sports Resolution Sniping sucht sehr kurze Situationen nach Spielende: Der Score ist final, aber der Polymarket-Preis des Gewinner-Tokens ist noch nicht bei fast 1.00 angekommen.",
    "",
    "In dieser Version ist das konservativ umgesetzt: Ein Paper-Fire ist nur erlaubt, wenn Sports-Feed, Gamma-Mapping, zweite Referenz und Orderbook alle zusammenpassen. Ohne diese Bestaetigung wird nur eine Diagnosezeile gespeichert.",
    "",
    "## Zahlen",
    "",
    `- Sports ticks gespeichert: ${input.sportsTicks}`,
    `- Sports watch rows: ${input.watches}`,
    `- Sports paper trades: ${input.paperTrades}`,
    "",
    "## Mapping Status",
    "",
    renderStatusTable(input.mappingStatus, "Status"),
    "",
    "## Watch / Rejection Reasons",
    "",
    renderStatusTable(input.watchReasons, "Reason"),
    "",
    "## Letzte Watch-Kandidaten",
    "",
    renderWatchTable(input.recentWatches),
    "",
    "## Wo Chancen entstehen koennten",
    "",
    "- Finales Spiel erkannt, aber Gewinner-Token handelt noch unter ca. 0.98.",
    "- Slug und Team-Outcomes sind eindeutig gemappt, besonders Away/Home korrekt.",
    "- Zweite Referenz bestaetigt denselben Endstand.",
    "- Orderbook hat echte Ask-Tiefe; der erwartete Edge bleibt nach Ask-Walk positiv.",
    "",
    "## Safety",
    "",
    "- Kein Live-Trading.",
    "- Keine echten Orders.",
    "- Keine Private Keys oder Secrets.",
    "- PnL wird nicht aus unresolvded Trades erfunden.",
    "",
  ].join("\n");
}

function groupedCount(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
): StatusRow[] {
  if (!tableExists(db, tableName)) {
    return [];
  }

  return db
    .prepare<StatusRow>(
      `
      SELECT COALESCE(${columnName}, 'unknown') AS key, COUNT(*) AS count
      FROM ${tableName}
      GROUP BY COALESCE(${columnName}, 'unknown')
      ORDER BY count DESC, key ASC
      `,
    )
    .all();
}

function recentWatches(db: SqliteDatabase): WatchRow[] {
  if (!tableExists(db, "sports_resolution_watch")) {
    return [];
  }

  return db
    .prepare<WatchRow>(
      `
      SELECT
        sports_slug,
        market_slug,
        winning_team,
        final_score,
        market_price,
        best_ask,
        expected_edge,
        validation_status,
        reason,
        timestamp
      FROM sports_resolution_watch
      ORDER BY timestamp DESC
      LIMIT 20
      `,
    )
    .all();
}

function renderStatusTable(rows: StatusRow[], label: string): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    `| ${label} | Count |`,
    "| --- | ---: |",
    ...rows.map((row) => `| ${escapeCell(row.key)} | ${row.count} |`),
  ].join("\n");
}

function renderWatchTable(rows: WatchRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Sports Slug | Market | Winner | Score | Market Price | Best Ask | Edge | Status | Reason |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.sports_slug)} | ${escapeCell(row.market_slug ?? "")} | ${escapeCell(row.winning_team ?? "")} | ${escapeCell(row.final_score ?? "")} | ${formatNumber(row.market_price)} | ${formatNumber(row.best_ask)} | ${formatNumber(row.expected_edge)} | ${escapeCell(row.validation_status)} | ${escapeCell(row.reason ?? "")} |`,
    ),
  ].join("\n");
}

function countRows(db: SqliteDatabase, tableName: string): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return db.prepare<CountRow>(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
    ?.count ?? 0;
}

function countWhere(
  db: SqliteDatabase,
  tableName: string,
  whereClause: string,
): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return db
    .prepare<CountRow>(
      `SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereClause}`,
    )
    .get()?.count ?? 0;
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName) !== undefined
  );
}

function writeReport(report: string, reportPath: string): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, "utf8");
  console.log(report);
  console.log(`Report written to: ${reportPath}`);
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(6);
}

function parseArgs(argv: string[]): SportsResolutionReportOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const dateArg = argv.find((arg) => arg.startsWith("--date="));

  return {
    dbPath: dbArg?.slice("--db=".length),
    reportDate: dateArg?.slice("--date=".length),
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runSportsResolutionReport(parseArgs(process.argv.slice(2)));
}
