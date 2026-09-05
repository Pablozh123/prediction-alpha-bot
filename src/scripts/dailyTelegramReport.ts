import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildForwardReplayReport,
  type SnapshotReplayRow,
  type TokenReplayMetrics
} from "./forwardReplayReport.js";
import {
  loadTelegramAlertConfig,
  sendTelegramAlert
} from "../utils/telegram.js";
import type { OrderBookLevel } from "../utils/orderbook.js";
import {
  classifyNegRiskOpportunityRecord,
  type NegRiskBasketClass,
} from "../scanner/negRiskBasketClassifier.js";

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

type ScanCycleWindowRow = {
  total: number;
  successful: number;
  failed: number;
};

export type DailyScannerSummary = {
  strategy: string;
  rawOpportunities: number;
  nearMissOpportunities?: number;
  validatedOpportunities: number;
  candidateOpportunities?: number;
  rejectedOpportunities: number;
  paperTrades: number;
};

export type DailyRejectionReason = {
  strategy: string;
  reason: string;
  count: number;
};

export type DailyTelegramReport = {
  generatedAt: string;
  dbPath: string;
  windowHours: number;
  since: number;
  scanCycles: ScanCycleWindowRow;
  scannerSummaries: DailyScannerSummary[];
  rejectionReasons: DailyRejectionReason[];
  paperTrades: number;
  liveTrades: number;
  snapshots: {
    total: number;
    uniqueTokens: number;
    uniqueMarkets: number;
    duplicateChecksums: number;
  };
  activeOrderbookTokenBlocks: number;
  shortDurationCandidates: number;
  shortDurationPaperFires: number;
  longDurationWatch: number;
  nearResolutionWatch: number;
  negRiskBasketClasses: Record<NegRiskBasketClass, number>;
  sportsWatch: {
    candidates: number;
    mapped: number;
    watchRows: number;
  };
  forwardReplay: {
    averageLatestMarkToBidMove: number | null;
    averageBestMarkToBidMove: number | null;
    tokensWithPositiveLatestBidMove: number;
    tokensWithPositiveBestBidMove: number;
    topTokens: TokenReplayMetrics[];
  };
};

type RunOptions = {
  dbPath?: string;
  reportDate?: string;
  sendAlert?: (message: string) => Promise<unknown>;
  targetSizeUsd?: number;
  windowHours?: number;
  writeToDisk?: boolean;
};

type SnapshotRow = {
  id: string;
  token_id: string;
  market_slug: string | null;
  opportunity_id: string | null;
  source: string;
  bids_json: string;
  asks_json: string;
  best_bid: number | null;
  best_ask: number | null;
  checksum: string | null;
  captured_at: number;
};

type NegRiskOpportunityRow = {
  id: string;
  slug: string | null;
  reason: string | null;
  expected_resolution_at: number | null;
  timestamp: number;
};

type OpportunityLegRow = {
  opportunity_id: string;
  question: string | null;
  slug: string | null;
};

const Database = require("better-sqlite3") as DatabaseConstructor;

export async function runDailyTelegramReport(
  options: RunOptions = {}
): Promise<DailyTelegramReport> {
  const report = buildDailyTelegramReportFromDb(options);
  const message = renderDailyTelegramMessage(report);

  if (options.writeToDisk !== false) {
    writeReport(options.reportDate ?? formatDate(new Date()), report);
  }

  if (options.sendAlert) {
    await options.sendAlert(message);
  } else {
    const telegramConfig = loadTelegramAlertConfig(process.env);

    if (telegramConfig.enabled) {
      const result = await sendTelegramAlert(telegramConfig, message);

      if (!result.ok) {
        throw new Error(result.error ?? "daily telegram report failed");
      }
    }
  }

  console.log(message);

  return report;
}

export function buildDailyTelegramReportFromDb(
  options: RunOptions = {}
): DailyTelegramReport {
  const dbPath = resolve(options.dbPath ?? "logs/trades.db");
  const generatedAt = new Date().toISOString();
  const windowHours = options.windowHours ?? 24;
  const since = Date.now() - windowHours * 60 * 60 * 1_000;

  if (!existsSync(dbPath)) {
    return emptyReport({
      dbPath,
      generatedAt,
      since,
      windowHours
    });
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const snapshots = tableExists(db, "orderbook_snapshots")
      ? loadSnapshotsSince(db, since)
      : [];
    const forwardReplay = buildForwardReplayReport({
      dbPath,
      generatedAt,
      snapshots,
      targetSizeUsd: options.targetSizeUsd ?? 1
    });

    return {
      generatedAt,
      dbPath,
      windowHours,
      since,
      scanCycles: loadScanCycles(db, since),
      scannerSummaries: loadScannerSummaries(db, since),
      rejectionReasons: loadRejectionReasons(db, since),
      paperTrades: countSince(db, "paper_trades", "timestamp", since),
      liveTrades: countRows(db, "live_trades"),
      snapshots: {
        total: forwardReplay.snapshotCount,
        uniqueTokens: forwardReplay.uniqueTokens,
        uniqueMarkets: forwardReplay.uniqueMarkets,
        duplicateChecksums: forwardReplay.duplicateChecksums
      },
      activeOrderbookTokenBlocks: countActiveOrderbookTokenBlocks(db),
      shortDurationCandidates: countOpportunitiesWhere(
        db,
        "capital_lock_class = 'short'",
        since,
      ),
      shortDurationPaperFires: countOpportunitiesWhere(
        db,
        "capital_lock_class = 'short' AND status = 'paper_fired'",
        since,
      ),
      longDurationWatch: countOpportunitiesWhere(
        db,
        "status = 'rejected' AND reason IN ('duration_too_long_for_short_arb', 'unknown_duration_for_short_arb')",
        since,
      ),
      nearResolutionWatch: countOpportunitiesWhere(
        db,
        "strategy = 'clear_win_watch'",
        since,
      ),
      negRiskBasketClasses: loadNegRiskBasketClassCounts(db, since),
      sportsWatch: loadSportsWatchSummary(db, since),
      forwardReplay: {
        averageLatestMarkToBidMove: forwardReplay.averageLatestMarkToBidMove,
        averageBestMarkToBidMove: forwardReplay.averageBestMarkToBidMove,
        tokensWithPositiveLatestBidMove:
          forwardReplay.tokensWithPositiveLatestBidMove,
        tokensWithPositiveBestBidMove:
          forwardReplay.tokensWithPositiveBestBidMove,
        topTokens: forwardReplay.tokens.slice(0, 3)
      }
    };
  } finally {
    db.close();
  }
}

export function renderDailyTelegramMessage(
  report: DailyTelegramReport
): string {
  return [
    "Paper bot daily report",
    `window: ${report.windowHours}h`,
    `scanCycles: ${report.scanCycles.successful}/${report.scanCycles.total} ok, ${report.scanCycles.failed} failed`,
    `snapshots: ${report.snapshots.total}, tokens: ${report.snapshots.uniqueTokens}, markets: ${report.snapshots.uniqueMarkets}`,
    `blocked orderbook tokens: ${report.activeOrderbookTokenBlocks}`,
    `paperTrades: ${report.paperTrades}, liveTrades: ${report.liveTrades}`,
    `short candidates: ${report.shortDurationCandidates}, short paper fires: ${report.shortDurationPaperFires}`,
    `long-duration watch: ${report.longDurationWatch}, near-resolution watch: ${report.nearResolutionWatch}`,
    `neg-risk classes: clean ${report.negRiskBasketClasses.clean_arb}, duration ${report.negRiskBasketClasses.duration_risk}, directional ${report.negRiskBasketClasses.directional_bucket}, ambiguous ${report.negRiskBasketClasses.invalid_or_ambiguous}`,
    `sports watch: ticks mapped ${report.sportsWatch.mapped}, candidates ${report.sportsWatch.candidates}, rows ${report.sportsWatch.watchRows}`,
    `forward latest avg: ${formatBps(report.forwardReplay.averageLatestMarkToBidMove)}`,
    `forward best avg: ${formatBps(report.forwardReplay.averageBestMarkToBidMove)}`,
    `positive latest tokens: ${report.forwardReplay.tokensWithPositiveLatestBidMove}`,
    `positive best tokens: ${report.forwardReplay.tokensWithPositiveBestBidMove}`,
    "",
    "Scanner funnel:",
    renderScannerLines(report.scannerSummaries),
    "",
    "Top rejections:",
    renderRejectionLines(report.rejectionReasons),
    "",
    "Top replay tokens:",
    renderReplayLines(report.forwardReplay.topTokens),
    "",
    "Safety: paper-only, no orders, no PnL claims from unresolved trades."
  ].join("\n");
}

export function renderDailyTelegramMarkdown(
  report: DailyTelegramReport
): string {
  return [
    `# Daily Telegram Report - ${report.generatedAt.slice(0, 10)}`,
    "",
    `Database: \`${report.dbPath}\``,
    `Window: ${report.windowHours}h`,
    "",
    "## Telegram Message",
    "",
    "```text",
    renderDailyTelegramMessage(report),
    "```",
    "",
    "## Safety Notes",
    "",
    "- Report is read-only against local SQLite data.",
    "- No live trading, no orders, no private keys, no secrets.",
    "- Forward replay uses orderbook quote movement only, not realized PnL.",
    ""
  ].join("\n");
}

function loadScanCycles(
  db: SqliteDatabase,
  since: number
): ScanCycleWindowRow {
  if (!tableExists(db, "scan_cycles")) {
    return {
      total: 0,
      successful: 0,
      failed: 0
    };
  }

  return (
    db
      .prepare<ScanCycleWindowRow>(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
        FROM scan_cycles
        WHERE timestamp >= ?
        `
      )
      .get(since) ?? {
      total: 0,
      successful: 0,
      failed: 0
    }
  );
}

function loadScannerSummaries(
  db: SqliteDatabase,
  since: number
): DailyScannerSummary[] {
  if (!tableExists(db, "scanner_runs")) {
    return [];
  }

  return db
    .prepare<DailyScannerSummary>(
      `
      SELECT
        strategy,
        SUM(raw_opportunities) AS rawOpportunities,
        SUM(${columnExists(db, "scanner_runs", "near_miss_opportunities") ? "near_miss_opportunities" : "0"}) AS nearMissOpportunities,
        SUM(validated_opportunities) AS validatedOpportunities,
        SUM(${columnExists(db, "scanner_runs", "candidate_opportunities") ? "candidate_opportunities" : "0"}) AS candidateOpportunities,
        SUM(rejected_opportunities) AS rejectedOpportunities,
        SUM(paper_trades) AS paperTrades
      FROM scanner_runs
      WHERE timestamp >= ?
      GROUP BY strategy
      ORDER BY strategy ASC
      `
    )
    .all(since);
}

function loadRejectionReasons(
  db: SqliteDatabase,
  since: number
): DailyRejectionReason[] {
  if (!tableExists(db, "opportunities")) {
    return [];
  }

  return db
    .prepare<DailyRejectionReason>(
      `
      SELECT
        strategy,
        COALESCE(reason, 'unknown') AS reason,
        COUNT(*) AS count
      FROM opportunities
      WHERE status = 'rejected'
        AND timestamp >= ?
      GROUP BY strategy, reason
      ORDER BY count DESC, strategy ASC, reason ASC
      LIMIT 5
      `
    )
    .all(since);
}

function loadSnapshotsSince(
  db: SqliteDatabase,
  since: number
): SnapshotReplayRow[] {
  return db
    .prepare<SnapshotRow>(
      `
      SELECT
        id,
        token_id,
        market_slug,
        opportunity_id,
        source,
        bids_json,
        asks_json,
        best_bid,
        best_ask,
        checksum,
        captured_at
      FROM orderbook_snapshots
      WHERE captured_at >= ?
      ORDER BY captured_at ASC
      `
    )
    .all(since)
    .map(mapSnapshotRow);
}

function mapSnapshotRow(row: SnapshotRow): SnapshotReplayRow {
  return {
    id: row.id,
    tokenId: row.token_id,
    marketSlug: row.market_slug,
    opportunityId: row.opportunity_id,
    source: row.source,
    bids: parseLevels(row.bids_json),
    asks: parseLevels(row.asks_json),
    bestBid: row.best_bid,
    bestAsk: row.best_ask,
    checksum: row.checksum,
    capturedAt: row.captured_at
  };
}

function parseLevels(value: string): OrderBookLevel[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((level): OrderBookLevel[] => {
      if (
        typeof level === "object" &&
        level !== null &&
        "price" in level &&
        "size" in level
      ) {
        const price = Number(level.price);
        const size = Number(level.size);

        if (
          Number.isFinite(price) &&
          price > 0 &&
          price < 1 &&
          Number.isFinite(size) &&
          size > 0
        ) {
          return [{ price, size }];
        }
      }

      return [];
    });
  } catch {
    return [];
  }
}

function countSince(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  since: number
): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return (
    db
      .prepare<CountRow>(
        `SELECT COUNT(*) AS count FROM ${tableName} WHERE ${columnName} >= ?`
      )
      .get(since)?.count ?? 0
  );
}

function countRows(db: SqliteDatabase, tableName: string): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  return (
    db.prepare<CountRow>(`SELECT COUNT(*) AS count FROM ${tableName}`).get()
      ?.count ?? 0
  );
}

function tableExists(db: SqliteDatabase, tableName: string): boolean {
  return (
    db
      .prepare<CountRow>(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(tableName)?.count === 1
  );
}

function emptyReport(input: {
  dbPath: string;
  generatedAt: string;
  since: number;
  windowHours: number;
}): DailyTelegramReport {
  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    windowHours: input.windowHours,
    since: input.since,
    scanCycles: {
      total: 0,
      successful: 0,
      failed: 0
    },
    scannerSummaries: [],
    rejectionReasons: [],
    paperTrades: 0,
    liveTrades: 0,
    snapshots: {
      total: 0,
      uniqueTokens: 0,
      uniqueMarkets: 0,
      duplicateChecksums: 0
    },
    activeOrderbookTokenBlocks: 0,
    shortDurationCandidates: 0,
    shortDurationPaperFires: 0,
    longDurationWatch: 0,
    nearResolutionWatch: 0,
    negRiskBasketClasses: emptyBasketClasses(),
    sportsWatch: {
      candidates: 0,
      mapped: 0,
      watchRows: 0
    },
    forwardReplay: {
      averageLatestMarkToBidMove: null,
      averageBestMarkToBidMove: null,
      tokensWithPositiveLatestBidMove: 0,
      tokensWithPositiveBestBidMove: 0,
      topTokens: []
    }
  };
}

function loadNegRiskBasketClassCounts(
  db: SqliteDatabase,
  since: number,
): Record<NegRiskBasketClass, number> {
  const counts = emptyBasketClasses();

  if (!tableExists(db, "opportunities")) {
    return counts;
  }

  const rows = db
    .prepare<NegRiskOpportunityRow>(
      `
      SELECT
        id,
        slug,
        reason,
        ${selectColumn(db, "opportunities", "expected_resolution_at", "NULL")},
        timestamp
      FROM opportunities
      WHERE strategy = 'neg_risk_bracket_arb'
        AND timestamp >= ?
      `,
    )
    .all(since);
  const legsByOpportunity = loadOpportunityLegs(db);

  for (const row of rows) {
    const classification = classifyNegRiskOpportunityRecord({
      eventSlug: row.slug,
      expectedResolutionAt: row.expected_resolution_at,
      legs: legsByOpportunity.get(row.id) ?? [],
      nowMs: row.timestamp,
      reason: row.reason === "paper_trade_recorded" ? null : row.reason,
    });

    counts[classification.basketClass] += 1;
  }

  return counts;
}

function loadOpportunityLegs(
  db: SqliteDatabase,
): Map<string, OpportunityLegRow[]> {
  const map = new Map<string, OpportunityLegRow[]>();

  if (!tableExists(db, "opportunity_legs")) {
    return map;
  }

  for (const row of db
    .prepare<OpportunityLegRow>(
      `
      SELECT opportunity_id, slug, question
      FROM opportunity_legs
      WHERE strategy = 'neg_risk_bracket_arb'
      ORDER BY opportunity_id ASC, leg_index ASC
      `,
    )
    .all()) {
    const current = map.get(row.opportunity_id) ?? [];

    current.push(row);
    map.set(row.opportunity_id, current);
  }

  return map;
}

function loadSportsWatchSummary(
  db: SqliteDatabase,
  since: number,
): DailyTelegramReport["sportsWatch"] {
  return {
    candidates: countSince(db, "sports_resolution_watch", "timestamp", since),
    mapped: tableExists(db, "sports_slug_mappings")
      ? countSportsMappings(db, since, "mapped")
      : 0,
    watchRows: countSince(db, "sports_resolution_watch", "timestamp", since),
  };
}

function countSportsMappings(
  db: SqliteDatabase,
  since: number,
  status: string,
): number {
  return (
    db
      .prepare<CountRow>(
        `
        SELECT COUNT(*) AS count
        FROM sports_slug_mappings
        WHERE updated_at >= ?
          AND mapping_status = ?
        `,
      )
      .get(since, status)?.count ?? 0
  );
}

function emptyBasketClasses(): Record<NegRiskBasketClass, number> {
  return {
    clean_arb: 0,
    duration_risk: 0,
    directional_bucket: 0,
    invalid_or_ambiguous: 0,
  };
}

function countOpportunitiesWhere(
  db: SqliteDatabase,
  whereClause: string,
  since: number,
): number {
  if (
    !tableExists(db, "opportunities") ||
    !columnExists(db, "opportunities", "capital_lock_class")
  ) {
    return 0;
  }

  return (
    db
      .prepare<CountRow>(
        `SELECT COUNT(*) AS count FROM opportunities WHERE timestamp >= ? AND ${whereClause}`,
      )
      .get(since)?.count ?? 0
  );
}

function columnExists(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
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
  fallbackSql: string,
): string {
  return columnExists(db, tableName, columnName)
    ? columnName
    : `${fallbackSql} AS ${columnName}`;
}

function countActiveOrderbookTokenBlocks(db: SqliteDatabase): number {
  if (!tableExists(db, "orderbook_token_blocks")) {
    return 0;
  }

  return (
    db
      .prepare<CountRow>(
        "SELECT COUNT(*) AS count FROM orderbook_token_blocks WHERE skip_until > ?"
      )
      .get(Date.now())?.count ?? 0
  );
}

function writeReport(reportDate: string, report: DailyTelegramReport): void {
  const reportPath = resolve(
    "docs",
    "reports",
    `daily-telegram-report-${reportDate}.md`
  );

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderDailyTelegramMarkdown(report), "utf8");
}

function renderScannerLines(rows: DailyScannerSummary[]): string {
  if (rows.length === 0) {
    return "- none";
  }

  // The same counters the published feed reads from scanner_runs, so the
  // Telegram line and the website never disagree on what a day held.
  return rows
    .map(
      (row) =>
        `- ${row.strategy}: raw ${row.rawOpportunities}, near miss ${row.nearMissOpportunities ?? 0}, validated ${row.validatedOpportunities}, carry ${row.candidateOpportunities ?? 0}, rejected ${row.rejectedOpportunities}, paper ${row.paperTrades}`
    )
    .join("\n");
}

function renderRejectionLines(rows: DailyRejectionReason[]): string {
  if (rows.length === 0) {
    return "- none";
  }

  return rows
    .map((row) => `- ${row.strategy}/${row.reason}: ${row.count}`)
    .join("\n");
}

function renderReplayLines(rows: TokenReplayMetrics[]): string {
  if (rows.length === 0) {
    return "- none";
  }

  return rows
    .map(
      (row) =>
        `- ${row.marketSlug ?? "unknown"} ${shortToken(row.tokenId)} best ${formatBps(row.bestMarkToBidMove)}, latest ${formatBps(row.latestMarkToBidMove)}`
    )
    .join("\n");
}

function formatBps(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value * 10_000).toFixed(2)} bps`;
}

function shortToken(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): RunOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const windowArg = argv.find((arg) => arg.startsWith("--window-hours="));
  const targetSizeArg = argv.find((arg) => arg.startsWith("--size-usd="));
  const windowHours =
    windowArg === undefined
      ? undefined
      : Number(windowArg.slice("--window-hours=".length));
  const targetSizeUsd =
    targetSizeArg === undefined
      ? undefined
      : Number(targetSizeArg.slice("--size-usd=".length));

  if (
    windowHours !== undefined &&
    (!Number.isFinite(windowHours) || windowHours <= 0)
  ) {
    throw new Error("--window-hours must be a positive number.");
  }

  if (
    targetSizeUsd !== undefined &&
    (!Number.isFinite(targetSizeUsd) || targetSizeUsd <= 0)
  ) {
    throw new Error("--size-usd must be a positive number.");
  }

  return {
    dbPath: dbArg?.slice("--db=".length),
    targetSizeUsd,
    windowHours
  };
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runDailyTelegramReport(parseArgs(process.argv.slice(2))).catch(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      console.error(`daily telegram report failed: ${message}`);
      process.exitCode = 1;
    }
  );
}
