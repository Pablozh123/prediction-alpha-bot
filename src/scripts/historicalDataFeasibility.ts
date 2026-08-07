import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { fetchActiveEvents } from "../utils/gamma.js";
import { fetchOrderBook, getBestBidAsk } from "../utils/orderbook.js";
import { fetchActivity } from "../utils/polymarketDataApi.js";

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

type ColumnRow = {
  name: string;
};

type OpportunityTokenRow = {
  token_ids: string | null;
};

export type FeasibilityStatus =
  | "available"
  | "partial"
  | "missing"
  | "skipped"
  | "error";

export type FeasibilityCheck = {
  source: string;
  status: FeasibilityStatus;
  evidence: string;
  backtestUse: string;
  limitation: string;
};

export type LocalHistoricalDataState = {
  dbExists: boolean;
  opportunities: number;
  paperTrades: number;
  unlinkedPaperTrades: number;
  orderbookSnapshotTable: boolean;
  orderbookSnapshots: number;
  opportunityLegs: number;
  sampleTokenId: string | null;
};

export type HistoricalDataFeasibilityReport = {
  generatedAt: string;
  dbPath: string;
  networkMode: "online" | "offline";
  local: LocalHistoricalDataState;
  checks: FeasibilityCheck[];
  verdict: {
    trueHistoricalOrderbookBacktest: "not_ready";
    tradePrintProxyBacktest: "possible_with_caveats" | "not_ready";
    forwardOrderbookReplay: "ready_to_collect" | "needs_snapshot_table";
  };
};

type RunOptions = {
  address?: string;
  dbPath?: string;
  offline?: boolean;
  reportDate?: string;
};

const Database = require("better-sqlite3") as DatabaseConstructor;

export async function runHistoricalDataFeasibility(
  options: RunOptions = {}
): Promise<HistoricalDataFeasibilityReport> {
  const dbPath = resolve(options.dbPath ?? "logs/trades.db");
  ensureExistingDbSchema(dbPath);
  const local = inspectLocalHistoricalDataState(dbPath);
  const checks = [
    buildBlockchainCheck(),
    buildLocalSnapshotCheck(local),
    buildLocalJournalCheck(local),
    ...(options.offline
      ? buildOfflineNetworkChecks(local)
      : await buildOnlineNetworkChecks(local, options.address))
  ];
  const report = buildHistoricalDataFeasibilityReport({
    checks,
    dbPath,
    generatedAt: new Date().toISOString(),
    local,
    networkMode: options.offline ? "offline" : "online"
  });
  const reportDate = options.reportDate ?? formatDate(new Date());
  const reportBasePath = resolve(
    "docs",
    "research",
    `historical-data-feasibility-${reportDate}`
  );

  writeReports(reportBasePath, report);
  return report;
}

function ensureExistingDbSchema(dbPath: string): void {
  if (!existsSync(dbPath)) {
    return;
  }

  try {
    initDb(dbPath);
  } finally {
    closeDb();
  }
}

export function buildHistoricalDataFeasibilityReport(input: {
  checks: FeasibilityCheck[];
  dbPath: string;
  generatedAt: string;
  local: LocalHistoricalDataState;
  networkMode: "online" | "offline";
}): HistoricalDataFeasibilityReport {
  const hasTradePrintProxy = input.checks.some(
    (check) =>
      check.source === "Polymarket Data API activity" &&
      (check.status === "available" || check.status === "partial")
  );

  return {
    generatedAt: input.generatedAt,
    dbPath: input.dbPath,
    networkMode: input.networkMode,
    local: input.local,
    checks: input.checks,
    verdict: {
      trueHistoricalOrderbookBacktest: "not_ready",
      tradePrintProxyBacktest: hasTradePrintProxy
        ? "possible_with_caveats"
        : "not_ready",
      forwardOrderbookReplay: input.local.orderbookSnapshotTable
        ? "ready_to_collect"
        : "needs_snapshot_table"
    }
  };
}

export function renderHistoricalDataFeasibilityMarkdown(
  report: HistoricalDataFeasibilityReport
): string {
  return [
    `# Historical Data Feasibility - ${report.generatedAt.slice(0, 10)}`,
    "",
    `Database: \`${report.dbPath}\``,
    `Network checks: ${report.networkMode}`,
    "",
    "## Verdict",
    "",
    `- True historical orderbook backtest: ${report.verdict.trueHistoricalOrderbookBacktest}`,
    `- Historical trade-print proxy backtest: ${report.verdict.tradePrintProxyBacktest}`,
    `- Forward orderbook replay from local snapshots: ${report.verdict.forwardOrderbookReplay}`,
    "",
    "## Local Data State",
    "",
    `- DB exists: ${report.local.dbExists}`,
    `- Opportunities: ${report.local.opportunities}`,
    `- Paper trades: ${report.local.paperTrades}`,
    `- Paper trades without opportunity link: ${report.local.unlinkedPaperTrades}`,
    `- Opportunity leg rows: ${report.local.opportunityLegs}`,
    `- Orderbook snapshot table: ${report.local.orderbookSnapshotTable}`,
    `- Orderbook snapshots: ${report.local.orderbookSnapshots}`,
    `- Sample token available for current-book smoke test: ${report.local.sampleTokenId === null ? "false" : "true"}`,
    "",
    "## Source Matrix",
    "",
    renderCheckTable(report.checks),
    "",
    "## Interpretation",
    "",
    "- Blockchain and trade activity can support historical trade-print research, but they do not reconstruct resting orderbook depth.",
    "- A true replay requires timestamped bid/ask snapshots captured at decision time or a trusted historical orderbook archive.",
    "- Current CLOB orderbook reads are useful for forward paper validation, not for old timestamps.",
    "- Existing legacy paper rows without `opportunity_id` remain diagnostic only.",
    "",
    "## Recommended Next Step",
    "",
    "Build and run a forward snapshot collector that records current orderbooks for scanner candidate tokens into `orderbook_snapshots`, then evaluate only data collected after that collector starts.",
    "",
    "## Safety Notes",
    "",
    "- This report is read-only against Polymarket APIs.",
    "- No orders are placed or simulated as fills without stored depth.",
    "- No private keys, seed phrases, API secrets, or environment values are printed.",
    ""
  ].join("\n");
}

function inspectLocalHistoricalDataState(
  dbPath: string
): LocalHistoricalDataState {
  if (!existsSync(dbPath)) {
    return {
      dbExists: false,
      opportunities: 0,
      paperTrades: 0,
      unlinkedPaperTrades: 0,
      orderbookSnapshotTable: false,
      orderbookSnapshots: 0,
      opportunityLegs: 0,
      sampleTokenId: null
    };
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const orderbookSnapshotTable = tableExists(db, "orderbook_snapshots");

    return {
      dbExists: true,
      opportunities: countRows(db, "opportunities"),
      paperTrades: countRows(db, "paper_trades"),
      unlinkedPaperTrades: countUnlinkedPaperTrades(db),
      orderbookSnapshotTable,
      orderbookSnapshots: orderbookSnapshotTable
        ? countRows(db, "orderbook_snapshots")
        : 0,
      opportunityLegs: countRows(db, "opportunity_legs"),
      sampleTokenId: findSampleTokenId(db)
    };
  } finally {
    db.close();
  }
}

function buildBlockchainCheck(): FeasibilityCheck {
  return {
    source: "Polygon blockchain / settlement data",
    status: "partial",
    evidence: "On-chain data can show fills, transfers, balances, and resolution/settlement.",
    backtestUse: "Resolution and executed-trade verification.",
    limitation:
      "Resting CLOB bids/asks that never filled are off-chain and cannot be reconstructed from chain state alone."
  };
}

function buildLocalSnapshotCheck(
  local: LocalHistoricalDataState
): FeasibilityCheck {
  if (!local.orderbookSnapshotTable) {
    return {
      source: "Local orderbook_snapshots",
      status: "missing",
      evidence: "The local DB has no orderbook_snapshots table yet.",
      backtestUse: "Required for future true orderbook replay.",
      limitation: "No local historical orderbook depth is available."
    };
  }

  return {
    source: "Local orderbook_snapshots",
    status: local.orderbookSnapshots > 0 ? "available" : "partial",
    evidence: `${local.orderbookSnapshots} snapshot row(s) found.`,
    backtestUse: "Forward replay after snapshot collection starts.",
    limitation:
      "Snapshots only cover time after the collector is enabled; they do not backfill old books."
  };
}

function buildLocalJournalCheck(local: LocalHistoricalDataState): FeasibilityCheck {
  return {
    source: "Local paper journal",
    status: local.unlinkedPaperTrades > 0 ? "partial" : "available",
    evidence: `${local.paperTrades} paper trade(s), ${local.unlinkedPaperTrades} without opportunity link.`,
    backtestUse: "Local scanner behavior and legacy diagnostics.",
    limitation:
      "Unlinked paper trades cannot prove a validated executable opportunity."
  };
}

function buildOfflineNetworkChecks(
  local: LocalHistoricalDataState
): FeasibilityCheck[] {
  return [
    {
      source: "Gamma metadata API",
      status: "skipped",
      evidence: "Offline mode selected.",
      backtestUse: "Market discovery and token metadata.",
      limitation: "No remote availability check was performed."
    },
    {
      source: "Polymarket Data API activity",
      status: "skipped",
      evidence: "Offline mode selected.",
      backtestUse: "Historical trade-print proxy research.",
      limitation: "Needs a public proxy address for wallet activity checks."
    },
    {
      source: "Current CLOB orderbook endpoint",
      status: local.sampleTokenId === null ? "missing" : "skipped",
      evidence:
        local.sampleTokenId === null
          ? "No local token id found for a smoke test."
          : "Offline mode selected.",
      backtestUse: "Current executable depth only.",
      limitation: "Does not provide historical orderbooks."
    }
  ];
}

async function buildOnlineNetworkChecks(
  local: LocalHistoricalDataState,
  address: string | undefined
): Promise<FeasibilityCheck[]> {
  const checks = await Promise.all([
    checkGammaMetadata(),
    checkDataApiActivity(address),
    checkCurrentOrderbook(local.sampleTokenId)
  ]);

  return checks;
}

async function checkGammaMetadata(): Promise<FeasibilityCheck> {
  try {
    const events = await fetchActiveEvents(1);

    return {
      source: "Gamma metadata API",
      status: events.length > 0 ? "available" : "partial",
      evidence: `${events.length} active event(s) returned in smoke test.`,
      backtestUse: "Market discovery and token metadata.",
      limitation:
        "Useful for market metadata; not a historical orderbook archive."
    };
  } catch (error) {
    return sourceError("Gamma metadata API", error, "Market discovery.");
  }
}

async function checkDataApiActivity(
  address: string | undefined
): Promise<FeasibilityCheck> {
  if (!address || !isLikelyAddress(address)) {
    return {
      source: "Polymarket Data API activity",
      status: "skipped",
      evidence: "No public proxy address supplied via --address or POLYMARKET_RESEARCH_ADDRESS.",
      backtestUse: "Historical trade-print proxy research.",
      limitation:
        "Activity is wallet-scoped; it does not expose full historical orderbook depth."
    };
  }

  try {
    const activity = await fetchActivity(address, 10);

    return {
      source: "Polymarket Data API activity",
      status: "available",
      evidence: `${activity.length} activity row(s) returned in smoke test.`,
      backtestUse: "Historical trade-print proxy research.",
      limitation:
        "Trade prints are not the same as executable basket depth at scanner decision time."
    };
  } catch (error) {
    return sourceError(
      "Polymarket Data API activity",
      error,
      "Historical trade-print proxy research."
    );
  }
}

async function checkCurrentOrderbook(
  tokenId: string | null
): Promise<FeasibilityCheck> {
  if (tokenId === null) {
    return {
      source: "Current CLOB orderbook endpoint",
      status: "skipped",
      evidence: "No local token id found for a smoke test.",
      backtestUse: "Current executable depth only.",
      limitation:
        "Current orderbook cannot validate old timestamps without stored snapshots."
    };
  }

  try {
    const orderbook = await fetchOrderBook(tokenId);
    const best = getBestBidAsk(orderbook);

    return {
      source: "Current CLOB orderbook endpoint",
      status: "available",
      evidence: `${orderbook.bids.length} bid level(s), ${orderbook.asks.length} ask level(s), bestBid=${formatNullable(best.bestBid)}, bestAsk=${formatNullable(best.bestAsk)}.`,
      backtestUse: "Current and forward paper validation.",
      limitation:
        "The endpoint returns current depth, not historical snapshots."
    };
  } catch (error) {
    return sourceError(
      "Current CLOB orderbook endpoint",
      error,
      "Current executable depth only."
    );
  }
}

function sourceError(
  source: string,
  error: unknown,
  backtestUse: string
): FeasibilityCheck {
  return {
    source,
    status: "error",
    evidence: error instanceof Error ? error.message : String(error),
    backtestUse,
    limitation: "The check failed; do not infer availability from this run."
  };
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

function countUnlinkedPaperTrades(db: SqliteDatabase): number {
  if (
    !tableExists(db, "paper_trades") ||
    !columnExists(db, "paper_trades", "opportunity_id")
  ) {
    return countRows(db, "paper_trades");
  }

  return (
    db
      .prepare<CountRow>(
        "SELECT COUNT(*) AS count FROM paper_trades WHERE opportunity_id IS NULL"
      )
      .get()?.count ?? 0
  );
}

function findSampleTokenId(db: SqliteDatabase): string | null {
  if (!tableExists(db, "opportunities")) {
    return null;
  }

  const rows = db
    .prepare<OpportunityTokenRow>(
      `
      SELECT token_ids
      FROM opportunities
      WHERE token_ids IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 50
      `
    )
    .all();

  for (const row of rows) {
    const tokenId = parseFirstTokenId(row.token_ids);

    if (tokenId !== null) {
      return tokenId;
    }
  }

  return null;
}

function parseFirstTokenId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return null;
    }

    const tokenId = parsed.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0
    );

    return tokenId ?? null;
  } catch {
    return null;
  }
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
    .prepare<ColumnRow>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

function writeReports(
  reportBasePath: string,
  report: HistoricalDataFeasibilityReport
): void {
  mkdirSync(dirname(reportBasePath), { recursive: true });
  writeFileSync(
    `${reportBasePath}.md`,
    renderHistoricalDataFeasibilityMarkdown(report),
    "utf8"
  );
  writeFileSync(`${reportBasePath}.json`, JSON.stringify(report, null, 2), "utf8");
  console.log(renderHistoricalDataFeasibilityMarkdown(report));
  console.log(`Report written to: ${reportBasePath}.md`);
  console.log(`Report written to: ${reportBasePath}.json`);
}

function renderCheckTable(checks: FeasibilityCheck[]): string {
  return [
    "| Source | Status | Backtest Use | Evidence | Limitation |",
    "| --- | --- | --- | --- | --- |",
    ...checks.map(
      (check) =>
        `| ${escapeCell(check.source)} | ${check.status} | ${escapeCell(check.backtestUse)} | ${escapeCell(check.evidence)} | ${escapeCell(check.limitation)} |`
    )
  ].join("\n");
}

function isLikelyAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function parseArgs(argv: string[]): RunOptions {
  const addressArg = argv.find((arg) => arg.startsWith("--address="));
  const dbArg = argv.find((arg) => arg.startsWith("--db="));

  return {
    address:
      addressArg?.slice("--address=".length) ??
      process.env.POLYMARKET_RESEARCH_ADDRESS,
    dbPath: dbArg?.slice("--db=".length),
    offline: argv.includes("--offline")
  };
}

function formatNullable(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  runHistoricalDataFeasibility(parseArgs(process.argv.slice(2))).catch(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`historical data feasibility failed: ${message}`);
      process.exitCode = 1;
    }
  );
}
