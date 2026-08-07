import "dotenv/config";
import axios from "axios";
import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "../execution/db.js";
import { resolveOpenPaperTradesBatch } from "../execution/paperResolution.js";
import { runBasketForwardReplayReport } from "./basketForwardReplayReport.js";
import { runPaperReport } from "./paperReport.js";
import { runStrategyEvaluation } from "./strategyEvaluation.js";

const require = createRequire(import.meta.url);

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const DEFAULT_FAST_SCAN_INTERVAL_MS = 10_000;
const DEFAULT_MAX_SCAN_CYCLES = 8_640;
const DEFAULT_ORDERBOOK_SNAPSHOT_INTERVAL_MS = 300_000;
const DEFAULT_ORDERBOOK_SNAPSHOT_TOKEN_LIMIT = 160;
const DEFAULT_ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT = 400;
const DEFAULT_ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET = 16;
const DEFAULT_PAPER_FIRE_COOLDOWN_MS = 21_600_000;
const DEFAULT_CLEAN_BASKET_MIN_EDGE_BPS = 100;
const DEFAULT_CLEAN_BASKET_MIN_ROI_BPS = 100;
const DEFAULT_CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD = 100;
const DEFAULT_CLEAN_BASKET_MIN_LEG_DEPTH_USD = 100;
const DEFAULT_CLEAN_BASKET_MAX_LEG_SPREAD_BPS = 250;
const DEFAULT_MAX_SHORT_ARB_DURATION_HOURS = 72;
const HEALTH_URL = "http://127.0.0.1:9090/health";

type SqliteDatabase = {
  prepare<T = unknown>(
    sql: string,
  ): {
    get(...params: unknown[]): T | undefined;
  };
  close(): void;
};

type DatabaseConstructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => SqliteDatabase;

export type CleanForwardRunPaths = {
  baseName: string;
  dbPath: string;
  errLogPath: string;
  outLogPath: string;
  pidPath: string;
};

export type CleanForwardRunConfig = CleanForwardRunPaths & {
  date: string;
  env: Record<string, string>;
  maxScanCycles: number;
  scanIntervalMs: number;
  telegramDailyReportEnabled: boolean;
};

export type PublicCleanForwardRunConfig = Omit<CleanForwardRunConfig, "env"> & {
  env: Record<string, string>;
};

export type CleanForwardStartResult = {
  dryRun: boolean;
  pid: number | null;
  running: boolean;
  config: PublicCleanForwardRunConfig;
};

export type CleanForwardStatus = CleanForwardRunPaths & {
  db: {
    exists: boolean;
    liveTrades: number;
    opportunities: number;
    orderbookSnapshots: number;
    paperDedupeSkips: number;
    paperTrades: number;
    rejectedOpportunities: number;
    scanCycles: number;
  };
  health: {
    ok: boolean;
    detail: string;
  };
  pid: number | null;
  pidFileExists: boolean;
  running: boolean;
  stderrTail: string[];
  stdoutTail: string[];
};

export type CleanForwardRunOptions = {
  date?: string;
  dbPath?: string;
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
};

export type CleanForwardReportOptions = CleanForwardRunOptions & {
  resolutionLimit?: number;
};

type CountRow = {
  count: number;
};

const Database = require("better-sqlite3") as DatabaseConstructor;

export function buildCleanForwardRunConfig(
  options: CleanForwardRunOptions = {},
): CleanForwardRunConfig {
  const env = options.env ?? process.env;
  const date = options.date ?? formatDate(new Date());
  const paths = resolveCleanForwardRunPaths({
    date,
    dbPath: options.dbPath,
  });
  const telegramDailyReportEnabled = isTelegramReady(env);

  return {
    ...paths,
    date,
    env: {
      CLEAN_BASKET_FILTER_ENABLED: "true",
      CLEAN_BASKET_MAX_LEG_SPREAD_BPS: String(
        DEFAULT_CLEAN_BASKET_MAX_LEG_SPREAD_BPS,
      ),
      CLEAN_BASKET_MIN_EDGE_BPS: String(DEFAULT_CLEAN_BASKET_MIN_EDGE_BPS),
      CLEAN_BASKET_MIN_LEG_DEPTH_USD: String(
        DEFAULT_CLEAN_BASKET_MIN_LEG_DEPTH_USD,
      ),
      CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD: String(
        DEFAULT_CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD,
      ),
      CLEAN_BASKET_MIN_ROI_BPS: String(DEFAULT_CLEAN_BASKET_MIN_ROI_BPS),
      DATABASE_PATH: paths.dbPath,
      FAST_SCAN_ENABLED: "true",
      FAST_SCAN_INTERVAL_MS: String(DEFAULT_FAST_SCAN_INTERVAL_MS),
      MAX_SHORT_ARB_DURATION_HOURS: String(
        DEFAULT_MAX_SHORT_ARB_DURATION_HOURS,
      ),
      MAX_SCAN_CYCLES: String(DEFAULT_MAX_SCAN_CYCLES),
      ORDERBOOK_SNAPSHOT_ENABLED: "true",
      ORDERBOOK_SNAPSHOT_INTERVAL_MS: String(
        DEFAULT_ORDERBOOK_SNAPSHOT_INTERVAL_MS,
      ),
      ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT: String(
        DEFAULT_ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT,
      ),
      ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET: String(
        DEFAULT_ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET,
      ),
      ORDERBOOK_SNAPSHOT_TOKEN_LIMIT: String(
        DEFAULT_ORDERBOOK_SNAPSHOT_TOKEN_LIMIT,
      ),
      PAPER_FIRE_COOLDOWN_MS: String(DEFAULT_PAPER_FIRE_COOLDOWN_MS),
      PAPER_ONLY: "true",
      RUN_ONCE: "false",
      SCAN_INTERVAL_MS: String(DEFAULT_SCAN_INTERVAL_MS),
      TELEGRAM_DAILY_REPORT_ENABLED: telegramDailyReportEnabled
        ? "true"
        : "false",
      TELEGRAM_DAILY_REPORT_INTERVAL_MS: "86400000",
      TELEGRAM_DAILY_REPORT_ON_START: "false",
      TELEGRAM_DAILY_REPORT_WINDOW_HOURS: "24",
    },
    maxScanCycles: DEFAULT_MAX_SCAN_CYCLES,
    scanIntervalMs: DEFAULT_SCAN_INTERVAL_MS,
    telegramDailyReportEnabled,
  };
}

export function toPublicCleanForwardRunConfig(
  config: CleanForwardRunConfig,
): PublicCleanForwardRunConfig {
  return {
    ...config,
    env: { ...config.env },
  };
}

export function startCleanForwardRun(
  options: CleanForwardRunOptions = {},
): CleanForwardStartResult {
  const config = buildCleanForwardRunConfig(options);
  const publicConfig = toPublicCleanForwardRunConfig(config);

  if (options.dryRun) {
    return {
      dryRun: true,
      pid: null,
      running: false,
      config: publicConfig,
    };
  }

  const existingPid = readPid(config.pidPath);

  if (existingPid !== null && isProcessRunning(existingPid)) {
    return {
      dryRun: false,
      pid: existingPid,
      running: true,
      config: publicConfig,
    };
  }

  mkdirSync(dirname(config.dbPath), { recursive: true });
  const outFd = openSync(config.outLogPath, "a");
  const errFd = openSync(config.errLogPath, "a");

  try {
    const tsxCli = require.resolve("tsx/cli");
    const child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        ...config.env,
      },
      stdio: ["ignore", outFd, errFd],
      windowsHide: true,
    });

    if (child.pid === undefined) {
      throw new Error("Clean forward run process did not expose a PID.");
    }

    child.unref();
    writeFileSync(config.pidPath, `${child.pid}\n`, "utf8");

    return {
      dryRun: false,
      pid: child.pid,
      running: true,
      config: publicConfig,
    };
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
}

export async function getCleanForwardStatus(
  options: CleanForwardRunOptions & { checkHealth?: boolean } = {},
): Promise<CleanForwardStatus> {
  const paths = resolveCleanForwardRunPaths(options);
  const pid = readPid(paths.pidPath);
  const running = pid !== null && isProcessRunning(pid);
  const health =
    options.checkHealth === false
      ? { ok: false, detail: "health_check_skipped" }
      : await fetchHealth();

  return {
    ...paths,
    db: summarizeDb(paths.dbPath),
    health,
    pid,
    pidFileExists: existsSync(paths.pidPath),
    running,
    stderrTail: tailFile(paths.errLogPath, 12),
    stdoutTail: tailFile(paths.outLogPath, 12),
  };
}

export async function runCleanForwardReport(
  options: CleanForwardReportOptions = {},
): Promise<{
  basketReplayRows: number;
  dbPath: string;
  paperResolutionCheckedSlugs: number;
  strategyVerdicts: string[];
}> {
  const paths = resolveCleanForwardRunPaths(options);
  const reportDate = options.date ?? formatDate(new Date());

  runPaperReport({ dbPath: paths.dbPath, reportDate });
  const strategy = await runStrategyEvaluation(paths.dbPath, reportDate);
  const basket = runBasketForwardReplayReport({
    dbPath: paths.dbPath,
    reportDate,
  });
  const resolution = existsSync(paths.dbPath)
    ? await withInitializedDb(paths.dbPath, () =>
        resolveOpenPaperTradesBatch({ limit: options.resolutionLimit }),
      )
    : {
        checkedSlugs: 0,
      };

  return {
    basketReplayRows: basket.summary.total,
    dbPath: paths.dbPath,
    paperResolutionCheckedSlugs: resolution.checkedSlugs,
    strategyVerdicts: strategy.verdicts.map(
      (verdict) => `${verdict.strategy}:${verdict.verdict}`,
    ),
  };
}

function resolveCleanForwardRunPaths(
  options: Pick<CleanForwardRunOptions, "date" | "dbPath"> = {},
): CleanForwardRunPaths {
  if (options.dbPath) {
    return pathsFromDbPath(resolve(options.dbPath));
  }

  const latestPidPath = options.date ? null : findLatestCleanRunPid();

  if (latestPidPath) {
    return pathsFromBasePath(latestPidPath.replace(/\.pid$/u, ""));
  }

  const date = options.date ?? formatDate(new Date());

  return pathsFromBasePath(resolve("logs", `forward-clean-${date}`));
}

function pathsFromDbPath(dbPath: string): CleanForwardRunPaths {
  const extension = extname(dbPath);
  const basePath = extension ? dbPath.slice(0, -extension.length) : dbPath;

  return pathsFromBasePath(basePath, dbPath);
}

function pathsFromBasePath(
  basePath: string,
  dbPath = `${basePath}.db`,
): CleanForwardRunPaths {
  return {
    baseName: basename(basePath),
    dbPath,
    errLogPath: `${basePath}.err.log`,
    outLogPath: `${basePath}.out.log`,
    pidPath: `${basePath}.pid`,
  };
}

function findLatestCleanRunPid(): string | null {
  const logsDir = resolve("logs");

  if (!existsSync(logsDir)) {
    return null;
  }

  const candidates = readdirSync(logsDir)
    .filter((name) => /^forward-clean-\d{4}-\d{2}-\d{2}\.pid$/u.test(name))
    .map((name) => resolve(logsDir, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  return candidates[0] ?? null;
}

function readPid(pidPath: string): number | null {
  if (!existsSync(pidPath)) {
    return null;
  }

  const value = Number(readFileSync(pidPath, "utf8").trim());

  return Number.isInteger(value) && value > 0 ? value : null;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EPERM"
    );
  }
}

async function fetchHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await axios.get<unknown>(HEALTH_URL, { timeout: 1_000 });

    return {
      ok: response.status >= 200 && response.status < 300,
      detail: JSON.stringify(response.data),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeDb(dbPath: string): CleanForwardStatus["db"] {
  if (!existsSync(dbPath)) {
    return {
      exists: false,
      liveTrades: 0,
      opportunities: 0,
      orderbookSnapshots: 0,
      paperDedupeSkips: 0,
      paperTrades: 0,
      rejectedOpportunities: 0,
      scanCycles: 0,
    };
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    return {
      exists: true,
      liveTrades: countRows(db, "live_trades"),
      opportunities: countRows(db, "opportunities"),
      orderbookSnapshots: countRows(db, "orderbook_snapshots"),
      paperDedupeSkips: countRows(db, "paper_dedupe_skips"),
      paperTrades: countRows(db, "paper_trades"),
      rejectedOpportunities: countRows(
        db,
        "opportunities",
        "status = 'rejected' AND COALESCE(reason, '') != 'duplicate_within_cooldown'",
      ),
      scanCycles: countRows(db, "scan_cycles"),
    };
  } finally {
    db.close();
  }
}

function countRows(
  db: SqliteDatabase,
  tableName: string,
  whereClause?: string,
): number {
  if (!tableExists(db, tableName)) {
    return 0;
  }

  const sql = whereClause
    ? `SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereClause}`
    : `SELECT COUNT(*) AS count FROM ${tableName}`;

  return db.prepare<CountRow>(sql).get()?.count ?? 0;
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

function tailFile(filePath: string, lines: number): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .slice(-lines);
}

async function withInitializedDb<T>(
  dbPath: string,
  task: () => Promise<T>,
): Promise<T> {
  initDb(dbPath);

  try {
    return await task();
  } finally {
    closeDb();
  }
}

function isTelegramReady(env: NodeJS.ProcessEnv): boolean {
  return (
    parseBoolean(env.TELEGRAM_ALERTS_ENABLED, false) &&
    Boolean(env.TELEGRAM_BOT_TOKEN?.trim()) &&
    Boolean(env.TELEGRAM_CHAT_ID?.trim())
  );
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function printStartResult(result: CleanForwardStartResult): void {
  console.log(
    JSON.stringify(
      {
        dryRun: result.dryRun,
        pid: result.pid,
        running: result.running,
        config: result.config,
      },
      null,
      2,
    ),
  );
}

function printStatus(status: CleanForwardStatus): void {
  console.log(JSON.stringify(status, null, 2));
}

function parseOptions(argv: string[]): CleanForwardReportOptions {
  const dbArg = argv.find((arg) => arg.startsWith("--db="));
  const dateArg = argv.find((arg) => arg.startsWith("--date="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));

  return {
    date: dateArg?.slice("--date=".length),
    dbPath: dbArg?.slice("--db=".length),
    dryRun: argv.includes("--dry-run"),
    resolutionLimit:
      limitArg === undefined
        ? undefined
        : Number(limitArg.slice("--limit=".length)),
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
  const [command = "status", ...args] = process.argv.slice(2);
  const options = parseOptions(args);

  try {
    if (command === "start") {
      printStartResult(startCleanForwardRun(options));
    } else if (command === "status") {
      printStatus(await getCleanForwardStatus(options));
    } else if (command === "report") {
      console.log(
        JSON.stringify(await runCleanForwardReport(options), null, 2),
      );
    } else {
      throw new Error(
        "Usage: cleanForwardRun.ts <start|status|report> [--db=path] [--date=YYYY-MM-DD] [--dry-run]",
      );
    }
  } catch (error) {
    console.error(
      `clean forward run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
