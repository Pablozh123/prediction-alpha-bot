import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

type SqliteDatabase = {
  prepare<T = unknown>(
    sql: string,
  ): {
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | undefined;
  };
  close(): void;
};

type DatabaseConstructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

export type CoverageSnapshot = {
  tokenId: string;
  marketSlug: string | null;
  eventSlug: string | null;
  marketId: string | null;
  side: "YES" | "NO" | null;
  strategySource: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  capturedAt: number;
};

export type CoverageScannerRun = {
  strategy: string;
  timestamp: number;
  rawOpportunities: number;
  validatedOpportunities: number;
  rejectedOpportunities: number;
  dedupeSkips: number;
  paperTrades: number;
  durationMs: number;
  error: string | null;
};

export type CoverageScanCycle = {
  timestamp: number;
  success: number;
  opportunities: number;
  paperTrades: number;
  skippedDuplicates: number;
  rejectedOpportunities: number;
};

export type CoverageOpportunity = {
  strategy: string;
  status: string;
  reason: string | null;
  timestamp: number;
};

export type CoverageTokenBlock = {
  reason: string;
  count: number;
};

export type StrategyRunSummary = {
  strategy: string;
  runs: number;
  rawOpportunities: number;
  validatedOpportunities: number;
  rejectedOpportunities: number;
  dedupeSkips: number;
  paperTrades: number;
  averageDurationMs: number | null;
  errors: number;
};

export type CountMetric = {
  name: string;
  count: number;
};

export type WithinMarketNearMiss = {
  marketKey: string;
  slug: string | null;
  yesTokenId: string;
  noTokenId: string;
  askYes: number;
  askNo: number;
  totalCost: number;
  expectedEdge: number;
  distanceToThreshold: number;
  capturedAtDeltaMs: number;
  status: "candidate" | "near_miss";
};

export type NegRiskNearMiss = {
  eventSlug: string;
  legCount: number;
  executableSum: number;
  theoreticalPayout: number;
  expectedGrossEdge: number;
  edgeBps: number;
  capturedAtDeltaMs: number;
  worstLeg: {
    tokenId: string;
    marketSlug: string | null;
    ask: number;
  };
};

export type CoverageReport = {
  generatedAt: string;
  dbPath: string;
  scanCycles: {
    total: number;
    successful: number;
    failed: number;
  };
  scannerRuns: StrategyRunSummary[];
  snapshots: {
    total: number;
    uniqueTokens: number;
    uniqueMarkets: number;
    uniqueEvents: number;
    latestCapturedAt: string | null;
    latestStalenessMs: number | null;
    sideCounts: CountMetric[];
    sourceCounts: CountMetric[];
  };
  opportunities: {
    statusCounts: CountMetric[];
    rejectionReasons: CountMetric[];
  };
  counts: {
    liveTrades: number;
    paperTrades: number;
    paperDedupeSkips: number;
  };
  tokenBlocksByReason: CoverageTokenBlock[];
  withinMarketNearMisses: WithinMarketNearMiss[];
  negRiskNearMisses: NegRiskNearMiss[];
  warnings: string[];
};

type RunCoverageReportOptions = {
  dbPath?: string;
  reportDate?: string;
};

type CountRow = {
  count: number;
};

type SnapshotRow = {
  token_id: string;
  market_slug: string | null;
  event_slug: string | null;
  market_id: string | null;
  side: "YES" | "NO" | null;
  strategy_source: string | null;
  best_bid: number | null;
  best_ask: number | null;
  captured_at: number;
};

type ScannerRunRow = {
  strategy: string;
  timestamp: number;
  raw_opportunities: number;
  validated_opportunities: number;
  rejected_opportunities: number;
  dedupe_skips: number | null;
  paper_trades: number;
  duration_ms: number;
  error: string | null;
};

type ScanCycleRow = {
  timestamp: number;
  success: number;
  opportunities: number;
  paper_trades: number;
  skipped_duplicates: number;
  rejected_opportunities: number;
};

type OpportunityRow = {
  strategy: string;
  status: string;
  reason: string | null;
  timestamp: number;
};

type TokenBlockRow = {
  reason: string;
  count: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;
const DEFAULT_WITHIN_MARKET_THRESHOLD = 0.98;
const DEFAULT_MAX_SNAPSHOT_STALENESS_MS = 600_000;

export function buildCoverageReport(input: {
  dbPath: string;
  generatedAt?: string;
  liveTrades?: number;
  opportunities?: CoverageOpportunity[];
  paperDedupeSkips?: number;
  paperTrades?: number;
  scanCycles?: CoverageScanCycle[];
  scannerRuns?: CoverageScannerRun[];
  snapshots?: CoverageSnapshot[];
  tokenBlocksByReason?: CoverageTokenBlock[];
  withinMarketThreshold?: number;
  maxSnapshotStalenessMs?: number;
}): CoverageReport {
  const snapshots = input.snapshots ?? [];
  const scannerRuns = input.scannerRuns ?? [];
  const scanCycles = input.scanCycles ?? [];
  const opportunities = input.opportunities ?? [];
  const maxSnapshotStalenessMs =
    input.maxSnapshotStalenessMs ?? DEFAULT_MAX_SNAPSHOT_STALENESS_MS;
  const report: CoverageReport = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    dbPath: input.dbPath,
    scanCycles: summarizeScanCycles(scanCycles),
    scannerRuns: summarizeScannerRuns(scannerRuns),
    snapshots: summarizeSnapshots(snapshots),
    opportunities: summarizeOpportunities(opportunities),
    counts: {
      liveTrades: input.liveTrades ?? 0,
      paperTrades: input.paperTrades ?? 0,
      paperDedupeSkips: input.paperDedupeSkips ?? 0,
    },
    tokenBlocksByReason: [...(input.tokenBlocksByReason ?? [])].sort(
      (left, right) =>
        right.count - left.count || left.reason.localeCompare(right.reason),
    ),
    withinMarketNearMisses: buildWithinMarketNearMisses(snapshots, {
      maxSnapshotStalenessMs,
      threshold: input.withinMarketThreshold ?? DEFAULT_WITHIN_MARKET_THRESHOLD,
    }),
    negRiskNearMisses: buildNegRiskNearMisses(snapshots, {
      maxSnapshotStalenessMs,
    }),
    warnings: [],
  };

  report.warnings = buildWarnings(report);

  return report;
}

export function buildWithinMarketNearMisses(
  snapshots: CoverageSnapshot[],
  options: {
    maxSnapshotStalenessMs?: number;
    threshold?: number;
  } = {},
): WithinMarketNearMiss[] {
  const maxSnapshotStalenessMs =
    options.maxSnapshotStalenessMs ?? DEFAULT_MAX_SNAPSHOT_STALENESS_MS;
  const threshold = options.threshold ?? DEFAULT_WITHIN_MARKET_THRESHOLD;
  const grouped = new Map<string, CoverageSnapshot[]>();

  for (const snapshot of snapshots) {
    const marketKey = snapshot.marketId ?? snapshot.marketSlug;

    if (!marketKey || !snapshot.side || !isPlausiblePrice(snapshot.bestAsk)) {
      continue;
    }

    const group = grouped.get(marketKey) ?? [];

    group.push(snapshot);
    grouped.set(marketKey, group);
  }

  return [...grouped.entries()]
    .flatMap(([marketKey, group]): WithinMarketNearMiss[] => {
      const yes = latestBySide(group, "YES");
      const no = latestBySide(group, "NO");

      if (
        !yes ||
        !no ||
        !isPlausiblePrice(yes.bestAsk) ||
        !isPlausiblePrice(no.bestAsk)
      ) {
        return [];
      }

      const capturedAtDeltaMs = Math.abs(yes.capturedAt - no.capturedAt);

      if (capturedAtDeltaMs > maxSnapshotStalenessMs) {
        return [];
      }

      const totalCost = round(yes.bestAsk + no.bestAsk, 6);
      const expectedEdge = round(1 - totalCost, 6);

      return [
        {
          marketKey,
          slug: yes.marketSlug ?? no.marketSlug,
          yesTokenId: yes.tokenId,
          noTokenId: no.tokenId,
          askYes: yes.bestAsk,
          askNo: no.bestAsk,
          totalCost,
          expectedEdge,
          distanceToThreshold: round(totalCost - threshold, 6),
          capturedAtDeltaMs,
          status: totalCost < threshold ? "candidate" : "near_miss",
        },
      ];
    })
    .sort(
      (left, right) =>
        left.totalCost - right.totalCost ||
        left.capturedAtDeltaMs - right.capturedAtDeltaMs ||
        left.marketKey.localeCompare(right.marketKey),
    )
    .slice(0, 20);
}

export function buildNegRiskNearMisses(
  snapshots: CoverageSnapshot[],
  options: { maxSnapshotStalenessMs?: number } = {},
): NegRiskNearMiss[] {
  const maxSnapshotStalenessMs =
    options.maxSnapshotStalenessMs ?? DEFAULT_MAX_SNAPSHOT_STALENESS_MS;
  const latestNoByEventMarket = new Map<string, CoverageSnapshot>();

  for (const snapshot of snapshots) {
    const eventSlug = snapshot.eventSlug;
    const marketKey =
      snapshot.marketId ?? snapshot.marketSlug ?? snapshot.tokenId;

    if (
      !eventSlug ||
      snapshot.side !== "NO" ||
      !marketKey ||
      !isPlausiblePrice(snapshot.bestAsk)
    ) {
      continue;
    }

    const key = `${eventSlug}\u0000${marketKey}`;
    const current = latestNoByEventMarket.get(key);

    if (!current || snapshot.capturedAt > current.capturedAt) {
      latestNoByEventMarket.set(key, snapshot);
    }
  }

  const byEvent = new Map<string, CoverageSnapshot[]>();

  for (const snapshot of latestNoByEventMarket.values()) {
    const eventSlug = snapshot.eventSlug;

    if (!eventSlug) {
      continue;
    }

    const group = byEvent.get(eventSlug) ?? [];

    group.push(snapshot);
    byEvent.set(eventSlug, group);
  }

  return [...byEvent.entries()]
    .flatMap(([eventSlug, legs]): NegRiskNearMiss[] => {
      if (legs.length < 3) {
        return [];
      }

      const times = legs.map((leg) => leg.capturedAt);
      const capturedAtDeltaMs = Math.max(...times) - Math.min(...times);

      if (capturedAtDeltaMs > maxSnapshotStalenessMs) {
        return [];
      }

      const executableSum = round(
        legs.reduce((sum, leg) => sum + (leg.bestAsk ?? 0), 0),
        6,
      );
      const theoreticalPayout = legs.length - 1;
      const expectedGrossEdge = round(theoreticalPayout - executableSum, 6);
      const worstLeg =
        [...legs].sort(
          (left, right) => (right.bestAsk ?? 0) - (left.bestAsk ?? 0),
        )[0] ?? legs[0];

      if (!worstLeg || !isPlausiblePrice(worstLeg.bestAsk)) {
        return [];
      }

      return [
        {
          eventSlug,
          legCount: legs.length,
          executableSum,
          theoreticalPayout,
          expectedGrossEdge,
          edgeBps: round(expectedGrossEdge * 10_000, 2),
          capturedAtDeltaMs,
          worstLeg: {
            tokenId: worstLeg.tokenId,
            marketSlug: worstLeg.marketSlug,
            ask: worstLeg.bestAsk,
          },
        },
      ];
    })
    .sort(
      (left, right) =>
        right.expectedGrossEdge - left.expectedGrossEdge ||
        left.capturedAtDeltaMs - right.capturedAtDeltaMs ||
        left.eventSlug.localeCompare(right.eventSlug),
    )
    .slice(0, 20);
}

export function renderCoverageMarkdown(report: CoverageReport): string {
  return [
    `# Coverage Report - ${report.generatedAt.slice(0, 10)}`,
    "",
    `Database: \`${report.dbPath}\``,
    "",
    "## Summary",
    "",
    `- Scan cycles: ${report.scanCycles.total} (${report.scanCycles.successful} successful, ${report.scanCycles.failed} failed)`,
    `- Snapshots: ${report.snapshots.total}`,
    `- Unique tokens: ${report.snapshots.uniqueTokens}`,
    `- Unique markets: ${report.snapshots.uniqueMarkets}`,
    `- Unique events: ${report.snapshots.uniqueEvents}`,
    `- Latest snapshot: ${report.snapshots.latestCapturedAt ?? "n/a"}`,
    `- Latest snapshot staleness ms: ${formatNumber(report.snapshots.latestStalenessMs)}`,
    `- Paper trades: ${report.counts.paperTrades}`,
    `- Live trades rows: ${report.counts.liveTrades}`,
    `- Dedupe skips: ${report.counts.paperDedupeSkips}`,
    "",
    "## Warnings",
    "",
    renderList(report.warnings),
    "",
    "## Scanner Runs",
    "",
    renderScannerRunTable(report.scannerRuns),
    "",
    "## Snapshot Sides",
    "",
    renderCountTable("Side", report.snapshots.sideCounts),
    "",
    "## Snapshot Sources",
    "",
    renderCountTable("Source", report.snapshots.sourceCounts),
    "",
    "## Opportunity Status",
    "",
    renderCountTable("Status", report.opportunities.statusCounts),
    "",
    "## Rejection Reasons",
    "",
    renderCountTable("Reason", report.opportunities.rejectionReasons),
    "",
    "## Token Blocks",
    "",
    renderCountTable(
      "Reason",
      report.tokenBlocksByReason.map((row) => ({
        name: row.reason,
        count: row.count,
      })),
    ),
    "",
    "## Within-Market Near Misses",
    "",
    renderWithinMarketTable(report.withinMarketNearMisses),
    "",
    "## NEG_RISK Basket Near Misses",
    "",
    renderNegRiskTable(report.negRiskNearMisses),
    "",
    "## Notes",
    "",
    "- This report reads local snapshots only.",
    "- Near misses are diagnostics, not execution instructions.",
    "- Unresolved paper trades are not converted into PnL or win-rate claims.",
    "- No secrets or environment values are printed.",
    "",
  ].join("\n");
}

export function runCoverageReport(
  options: RunCoverageReportOptions = {},
): CoverageReport {
  const dbPath = resolve(
    options.dbPath ?? process.env.DATABASE_PATH ?? "logs/trades.db",
  );
  const reportDate = options.reportDate ?? formatDate(new Date());
  const reportBasePath = resolve(
    "docs",
    "reports",
    `coverage-report-${reportDate}`,
  );
  const report = existsSync(dbPath)
    ? buildCoverageReportFromDb(dbPath)
    : buildCoverageReport({
        dbPath,
        generatedAt: new Date().toISOString(),
      });
  const markdown = renderCoverageMarkdown(report);

  writeReport(`${reportBasePath}.md`, markdown);
  writeReport(`${reportBasePath}.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(markdown);
  console.log(`Coverage reports written to: ${reportBasePath}.md`);
  console.log(`Coverage reports written to: ${reportBasePath}.json`);

  return report;
}

function buildCoverageReportFromDb(dbPath: string): CoverageReport {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    return buildCoverageReport({
      dbPath,
      generatedAt: new Date().toISOString(),
      liveTrades: countRows(db, "live_trades"),
      opportunities: loadOpportunities(db),
      paperDedupeSkips: countRows(db, "paper_dedupe_skips"),
      paperTrades: countRows(db, "paper_trades"),
      scanCycles: loadScanCycles(db),
      scannerRuns: loadScannerRuns(db),
      snapshots: loadSnapshots(db),
      tokenBlocksByReason: loadTokenBlocksByReason(db),
    });
  } finally {
    db.close();
  }
}

function loadSnapshots(db: SqliteDatabase): CoverageSnapshot[] {
  if (!tableExists(db, "orderbook_snapshots")) {
    return [];
  }

  return db
    .prepare<SnapshotRow>(
      `
      SELECT
        token_id,
        market_slug,
        event_slug,
        market_id,
        side,
        strategy_source,
        best_bid,
        best_ask,
        captured_at
      FROM orderbook_snapshots
      ORDER BY captured_at DESC
      `,
    )
    .all()
    .map((row) => ({
      tokenId: row.token_id,
      marketSlug: row.market_slug,
      eventSlug: row.event_slug,
      marketId: row.market_id,
      side: row.side,
      strategySource: row.strategy_source,
      bestBid: row.best_bid,
      bestAsk: row.best_ask,
      capturedAt: row.captured_at,
    }));
}

function loadScannerRuns(db: SqliteDatabase): CoverageScannerRun[] {
  if (!tableExists(db, "scanner_runs")) {
    return [];
  }

  return db
    .prepare<ScannerRunRow>(
      `
      SELECT
        strategy,
        timestamp,
        raw_opportunities,
        validated_opportunities,
        rejected_opportunities,
        ${columnExists(db, "scanner_runs", "dedupe_skips") ? "dedupe_skips" : "0 AS dedupe_skips"},
        paper_trades,
        duration_ms,
        error
      FROM scanner_runs
      `,
    )
    .all()
    .map((row) => ({
      strategy: row.strategy,
      timestamp: row.timestamp,
      rawOpportunities: row.raw_opportunities,
      validatedOpportunities: row.validated_opportunities,
      rejectedOpportunities: row.rejected_opportunities,
      dedupeSkips: row.dedupe_skips ?? 0,
      paperTrades: row.paper_trades,
      durationMs: row.duration_ms,
      error: row.error,
    }));
}

function loadScanCycles(db: SqliteDatabase): CoverageScanCycle[] {
  if (!tableExists(db, "scan_cycles")) {
    return [];
  }

  return db
    .prepare<ScanCycleRow>(
      `
      SELECT
        timestamp,
        success,
        opportunities,
        paper_trades,
        skipped_duplicates,
        rejected_opportunities
      FROM scan_cycles
      `,
    )
    .all()
    .map((row) => ({
      timestamp: row.timestamp,
      success: row.success,
      opportunities: row.opportunities,
      paperTrades: row.paper_trades,
      skippedDuplicates: row.skipped_duplicates,
      rejectedOpportunities: row.rejected_opportunities,
    }));
}

function loadOpportunities(db: SqliteDatabase): CoverageOpportunity[] {
  if (!tableExists(db, "opportunities")) {
    return [];
  }

  return db
    .prepare<OpportunityRow>(
      `
      SELECT strategy, status, reason, timestamp
      FROM opportunities
      `,
    )
    .all()
    .map((row) => ({
      strategy: row.strategy,
      status: row.status,
      reason: row.reason,
      timestamp: row.timestamp,
    }));
}

function loadTokenBlocksByReason(db: SqliteDatabase): CoverageTokenBlock[] {
  if (!tableExists(db, "orderbook_token_blocks")) {
    return [];
  }

  return db
    .prepare<TokenBlockRow>(
      `
      SELECT reason, COUNT(*) AS count
      FROM orderbook_token_blocks
      GROUP BY reason
      ORDER BY count DESC, reason ASC
      `,
    )
    .all()
    .map((row) => ({
      reason: row.reason,
      count: row.count,
    }));
}

function summarizeScanCycles(
  scanCycles: CoverageScanCycle[],
): CoverageReport["scanCycles"] {
  return {
    total: scanCycles.length,
    successful: scanCycles.filter((cycle) => cycle.success === 1).length,
    failed: scanCycles.filter((cycle) => cycle.success !== 1).length,
  };
}

function summarizeScannerRuns(
  scannerRuns: CoverageScannerRun[],
): StrategyRunSummary[] {
  const grouped = new Map<string, CoverageScannerRun[]>();

  for (const run of scannerRuns) {
    const group = grouped.get(run.strategy) ?? [];

    group.push(run);
    grouped.set(run.strategy, group);
  }

  return [...grouped.entries()]
    .map(([strategy, runs]) => ({
      strategy,
      runs: runs.length,
      rawOpportunities: sum(runs.map((run) => run.rawOpportunities)),
      validatedOpportunities: sum(
        runs.map((run) => run.validatedOpportunities),
      ),
      rejectedOpportunities: sum(runs.map((run) => run.rejectedOpportunities)),
      dedupeSkips: sum(runs.map((run) => run.dedupeSkips)),
      paperTrades: sum(runs.map((run) => run.paperTrades)),
      averageDurationMs:
        runs.length === 0
          ? null
          : round(sum(runs.map((run) => run.durationMs)) / runs.length, 2),
      errors: runs.filter((run) => run.error !== null && run.error.length > 0)
        .length,
    }))
    .sort((left, right) => left.strategy.localeCompare(right.strategy));
}

function summarizeSnapshots(
  snapshots: CoverageSnapshot[],
): CoverageReport["snapshots"] {
  const marketKeys = snapshots
    .map((snapshot) => snapshot.marketId ?? snapshot.marketSlug)
    .filter((value): value is string => Boolean(value));
  const latestCapturedAt =
    snapshots.length === 0
      ? null
      : Math.max(...snapshots.map((snapshot) => snapshot.capturedAt));

  return {
    total: snapshots.length,
    uniqueTokens: new Set(snapshots.map((snapshot) => snapshot.tokenId)).size,
    uniqueMarkets: new Set(marketKeys).size,
    uniqueEvents: new Set(
      snapshots
        .map((snapshot) => snapshot.eventSlug)
        .filter((value): value is string => Boolean(value)),
    ).size,
    latestCapturedAt:
      latestCapturedAt === null
        ? null
        : new Date(latestCapturedAt).toISOString(),
    latestStalenessMs:
      latestCapturedAt === null ? null : Date.now() - latestCapturedAt,
    sideCounts: countByName(
      snapshots.map((snapshot) => snapshot.side ?? "unknown"),
    ),
    sourceCounts: countByName(
      snapshots.map((snapshot) => snapshot.strategySource ?? "unknown"),
    ),
  };
}

function summarizeOpportunities(
  opportunities: CoverageOpportunity[],
): CoverageReport["opportunities"] {
  return {
    statusCounts: countByName(
      opportunities.map((opportunity) => opportunity.status),
    ),
    rejectionReasons: countByName(
      opportunities
        .filter(
          (opportunity) =>
            opportunity.status === "rejected" &&
            opportunity.reason !== "duplicate_within_cooldown",
        )
        .map((opportunity) => opportunity.reason ?? "unknown"),
    ),
  };
}

function buildWarnings(report: CoverageReport): string[] {
  const warnings: string[] = [];
  const rawFound = sum(report.scannerRuns.map((run) => run.rawOpportunities));

  if (report.counts.liveTrades > 0) {
    warnings.push(
      "live_trades rows exist; audit them before using this dataset.",
    );
  }

  if (report.snapshots.uniqueTokens < 100) {
    warnings.push("LOW_TOKEN_COVERAGE: fewer than 100 unique snapshot tokens.");
  }

  if (report.snapshots.uniqueMarkets < 75) {
    warnings.push(
      "LOW_MARKET_COVERAGE: fewer than 75 unique snapshot markets.",
    );
  }

  if (report.scanCycles.total >= 60 && rawFound === 0) {
    warnings.push(
      "NO_RAW_OPPORTUNITIES_AFTER_60_CYCLES: scanner coverage may be too narrow.",
    );
  }

  if (report.withinMarketNearMisses.length === 0) {
    warnings.push(
      "NO_WITHIN_MARKET_NEAR_MISSES: snapshot universe may lack paired YES/NO books.",
    );
  }

  if (report.negRiskNearMisses.length === 0) {
    warnings.push(
      "NO_NEG_RISK_NEAR_MISSES: snapshot universe may lack complete NEG_RISK baskets.",
    );
  }

  return warnings;
}

function latestBySide(
  snapshots: CoverageSnapshot[],
  side: "YES" | "NO",
): CoverageSnapshot | undefined {
  return snapshots
    .filter((snapshot) => snapshot.side === side)
    .sort((left, right) => right.capturedAt - left.capturedAt)[0];
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
      .prepare<{
        name: string;
      }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
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

function countByName(values: string[]): CountMetric[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name),
    );
}

function writeReport(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function renderList(values: string[]): string {
  if (values.length === 0) {
    return "- None";
  }

  return values.map((value) => `- ${value}`).join("\n");
}

function renderScannerRunTable(rows: StrategyRunSummary[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Strategy | Runs | Raw | Validated | Rejected | Dedupe | Paper | Avg duration ms | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.strategy)} | ${row.runs} | ${row.rawOpportunities} | ${row.validatedOpportunities} | ${row.rejectedOpportunities} | ${row.dedupeSkips} | ${row.paperTrades} | ${formatNumber(row.averageDurationMs)} | ${row.errors} |`,
    ),
  ].join("\n");
}

function renderCountTable(label: string, rows: CountMetric[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    `| ${label} | Count |`,
    "| --- | ---: |",
    ...rows.map((row) => `| ${escapeCell(row.name)} | ${row.count} |`),
  ].join("\n");
}

function renderWithinMarketTable(rows: WithinMarketNearMiss[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Market | YES Ask | NO Ask | Total Cost | Expected Edge | Distance to 0.98 | Status | Snapshot Delta ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.slug ?? row.marketKey)} | ${formatNumber(row.askYes)} | ${formatNumber(row.askNo)} | ${formatNumber(row.totalCost)} | ${formatNumber(row.expectedEdge)} | ${formatNumber(row.distanceToThreshold)} | ${row.status} | ${row.capturedAtDeltaMs} |`,
    ),
  ].join("\n");
}

function renderNegRiskTable(rows: NegRiskNearMiss[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Event | Legs | Ask Sum | Payout | Gross Edge | Edge bps | Worst Leg Ask | Snapshot Delta ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.eventSlug)} | ${row.legCount} | ${formatNumber(row.executableSum)} | ${formatNumber(row.theoreticalPayout)} | ${formatNumber(row.expectedGrossEdge)} | ${formatNumber(row.edgeBps)} | ${formatNumber(row.worstLeg.ask)} | ${row.capturedAtDeltaMs} |`,
    ),
  ].join("\n");
}

function isPlausiblePrice(value: number | null): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 1
  );
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;

  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return String(value);
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): RunCoverageReportOptions {
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
  runCoverageReport(parseArgs(process.argv.slice(2)));
}
