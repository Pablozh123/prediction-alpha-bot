import "dotenv/config";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "./execution/db.js";
import { scanClearWinWatchOpportunities } from "./scanner/clearWinWatchScanner.js";
import { runOrderBookSnapshotCycle } from "./scanner/orderbookSnapshotCycle.js";
import { runScanCycle, type ScanCycleLogger } from "./scanner/runScanCycle.js";
import { runDailyTelegramReport } from "./scripts/dailyTelegramReport.js";
import { closeHealthServer, startHealthServer } from "./utils/health.js";
import {
  formatStructuredError,
  formatStructuredLog,
  logError,
  logInfo,
  logWarn,
} from "./utils/logger.js";
import { incrementErrors, incrementScanOverlapSkips } from "./utils/metrics.js";
import {
  formatTelegramAlert,
  loadTelegramAlertConfig,
  sendTelegramAlert,
} from "./utils/telegram.js";

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const DEFAULT_FAST_SCAN_INTERVAL_MS = 10_000;
const DEFAULT_PAPER_FIRE_COOLDOWN_MS = 21_600_000;
const DEFAULT_ORDERBOOK_SNAPSHOT_INTERVAL_MS = 300_000;
const DEFAULT_ORDERBOOK_SNAPSHOT_TOKEN_LIMIT = 160;
const DEFAULT_ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT = 400;
const DEFAULT_ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET = 16;
const DEFAULT_TELEGRAM_DAILY_REPORT_INTERVAL_MS = 86_400_000;
const DEFAULT_TELEGRAM_DAILY_REPORT_WINDOW_HOURS = 24;
const DEFAULT_CLEAN_BASKET_MIN_EDGE_BPS = 100;
const DEFAULT_CLEAN_BASKET_MIN_ROI_BPS = 100;
const DEFAULT_CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD = 100;
const DEFAULT_CLEAN_BASKET_MIN_LEG_DEPTH_USD = 100;
const DEFAULT_CLEAN_BASKET_MAX_LEG_SPREAD_BPS = 250;
const DEFAULT_MAX_SHORT_ARB_DURATION_HOURS = 72;

type StartBotOptions = {
  argv?: string[];
  dbPath?: string;
  dailyReportIntervalMs?: number;
  env?: NodeJS.ProcessEnv;
  exit?: (code?: number) => void;
  intervalMs?: number;
  logger?: ScanCycleLogger;
  metricsServer?: boolean;
  orderbookSnapshotIntervalMs?: number;
  registerSignals?: boolean;
  runCycle?: () => Promise<unknown>;
  runDailyReport?: () => Promise<unknown>;
  runInitialScan?: boolean;
  runInitialSnapshot?: boolean;
  runSnapshotCycle?: () => Promise<unknown>;
  sendAlert?: (message: string) => Promise<unknown>;
};

export type BotConfig = {
  cleanBasketFilterEnabled: boolean;
  cleanBasketMaxLegSpreadBps: number;
  cleanBasketMinEdgeBps: number;
  cleanBasketMinLegDepthUsd: number;
  cleanBasketMinMaxPositiveCostUsd: number;
  cleanBasketMinRoiBps: number;
  databasePath?: string;
  fastScanEnabled: boolean;
  fastScanIntervalMs: number;
  maxShortArbDurationHours: number;
  maxScanCycles?: number;
  orderbookSnapshotEnabled: boolean;
  orderbookSnapshotGammaEventLimit: number;
  orderbookSnapshotIntervalMs: number;
  orderbookSnapshotMaxTokensPerMarket: number;
  orderbookSnapshotTokenLimit: number;
  paperFireCooldownMs: number;
  runOnce: boolean;
  scanIntervalMs: number;
  telegramAlertsEnabled: boolean;
  telegramDailyReportEnabled: boolean;
  telegramDailyReportIntervalMs: number;
  telegramDailyReportOnStart: boolean;
  telegramDailyReportWindowHours: number;
};

export type BotHandle = {
  done: Promise<void>;
  dailyReportInterval?: ReturnType<typeof setInterval>;
  interval?: ReturnType<typeof setInterval>;
  metricsServer?: Server;
  snapshotInterval?: ReturnType<typeof setInterval>;
  stop(): void;
};

const defaultLogger: ScanCycleLogger = {
  info: logInfo,
  warn: logWarn,
  error: logError,
};

export function assertPaperOnlyEnv(env: NodeJS.ProcessEnv = process.env): void {
  const paperOnly = (env.PAPER_ONLY ?? "true").trim().toLowerCase();

  if (paperOnly !== "true") {
    throw new Error(
      "PAPER_ONLY must be true. Live trading is not implemented.",
    );
  }
}

export function loadBotConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): BotConfig {
  assertPaperOnlyEnv(env);

  return {
    cleanBasketFilterEnabled: parseBoolean(
      env.CLEAN_BASKET_FILTER_ENABLED,
      true,
    ),
    cleanBasketMaxLegSpreadBps: parsePositiveInteger(
      env.CLEAN_BASKET_MAX_LEG_SPREAD_BPS,
      DEFAULT_CLEAN_BASKET_MAX_LEG_SPREAD_BPS,
      "CLEAN_BASKET_MAX_LEG_SPREAD_BPS",
    ),
    cleanBasketMinEdgeBps: parsePositiveInteger(
      env.CLEAN_BASKET_MIN_EDGE_BPS,
      DEFAULT_CLEAN_BASKET_MIN_EDGE_BPS,
      "CLEAN_BASKET_MIN_EDGE_BPS",
    ),
    cleanBasketMinLegDepthUsd: parsePositiveInteger(
      env.CLEAN_BASKET_MIN_LEG_DEPTH_USD,
      DEFAULT_CLEAN_BASKET_MIN_LEG_DEPTH_USD,
      "CLEAN_BASKET_MIN_LEG_DEPTH_USD",
    ),
    cleanBasketMinMaxPositiveCostUsd: parsePositiveInteger(
      env.CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD,
      DEFAULT_CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD,
      "CLEAN_BASKET_MIN_MAX_POSITIVE_COST_USD",
    ),
    cleanBasketMinRoiBps: parsePositiveInteger(
      env.CLEAN_BASKET_MIN_ROI_BPS,
      DEFAULT_CLEAN_BASKET_MIN_ROI_BPS,
      "CLEAN_BASKET_MIN_ROI_BPS",
    ),
    databasePath: env.DATABASE_PATH?.trim() || undefined,
    fastScanEnabled: parseBoolean(env.FAST_SCAN_ENABLED, true),
    fastScanIntervalMs: parsePositiveInteger(
      env.FAST_SCAN_INTERVAL_MS,
      DEFAULT_FAST_SCAN_INTERVAL_MS,
      "FAST_SCAN_INTERVAL_MS",
    ),
    maxShortArbDurationHours: parsePositiveInteger(
      env.MAX_SHORT_ARB_DURATION_HOURS,
      DEFAULT_MAX_SHORT_ARB_DURATION_HOURS,
      "MAX_SHORT_ARB_DURATION_HOURS",
    ),
    maxScanCycles: parseOptionalPositiveInteger(
      env.MAX_SCAN_CYCLES,
      "MAX_SCAN_CYCLES",
    ),
    orderbookSnapshotEnabled: parseBoolean(
      env.ORDERBOOK_SNAPSHOT_ENABLED,
      false,
    ),
    orderbookSnapshotGammaEventLimit: parsePositiveInteger(
      env.ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT,
      DEFAULT_ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT,
      "ORDERBOOK_SNAPSHOT_GAMMA_EVENT_LIMIT",
    ),
    orderbookSnapshotIntervalMs: parsePositiveInteger(
      env.ORDERBOOK_SNAPSHOT_INTERVAL_MS,
      DEFAULT_ORDERBOOK_SNAPSHOT_INTERVAL_MS,
      "ORDERBOOK_SNAPSHOT_INTERVAL_MS",
    ),
    orderbookSnapshotMaxTokensPerMarket: parsePositiveInteger(
      env.ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET,
      DEFAULT_ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET,
      "ORDERBOOK_SNAPSHOT_MAX_TOKENS_PER_MARKET",
    ),
    orderbookSnapshotTokenLimit: parsePositiveInteger(
      env.ORDERBOOK_SNAPSHOT_TOKEN_LIMIT,
      DEFAULT_ORDERBOOK_SNAPSHOT_TOKEN_LIMIT,
      "ORDERBOOK_SNAPSHOT_TOKEN_LIMIT",
    ),
    paperFireCooldownMs: parsePositiveInteger(
      env.PAPER_FIRE_COOLDOWN_MS,
      DEFAULT_PAPER_FIRE_COOLDOWN_MS,
      "PAPER_FIRE_COOLDOWN_MS",
    ),
    runOnce: argv.includes("--once") || parseBoolean(env.RUN_ONCE, false),
    scanIntervalMs: parsePositiveInteger(
      env.SCAN_INTERVAL_MS,
      DEFAULT_SCAN_INTERVAL_MS,
      "SCAN_INTERVAL_MS",
    ),
    telegramAlertsEnabled: parseBoolean(env.TELEGRAM_ALERTS_ENABLED, false),
    telegramDailyReportEnabled: parseBoolean(
      env.TELEGRAM_DAILY_REPORT_ENABLED,
      false,
    ),
    telegramDailyReportIntervalMs: parsePositiveInteger(
      env.TELEGRAM_DAILY_REPORT_INTERVAL_MS,
      DEFAULT_TELEGRAM_DAILY_REPORT_INTERVAL_MS,
      "TELEGRAM_DAILY_REPORT_INTERVAL_MS",
    ),
    telegramDailyReportOnStart: parseBoolean(
      env.TELEGRAM_DAILY_REPORT_ON_START,
      false,
    ),
    telegramDailyReportWindowHours: parsePositiveInteger(
      env.TELEGRAM_DAILY_REPORT_WINDOW_HOURS,
      DEFAULT_TELEGRAM_DAILY_REPORT_WINDOW_HOURS,
      "TELEGRAM_DAILY_REPORT_WINDOW_HOURS",
    ),
  };
}

export function startBot(options: StartBotOptions = {}): BotHandle {
  const logger = options.logger ?? defaultLogger;
  const config = loadBotConfig(
    options.env,
    options.argv ?? process.argv.slice(2),
  );
  const runSnapshotCycle =
    options.runSnapshotCycle ??
    (() =>
      runOrderBookSnapshotCycle({
        gammaEventLimit: config.orderbookSnapshotGammaEventLimit,
        logger,
        maxTokensPerMarket: config.orderbookSnapshotMaxTokensPerMarket,
        tokenLimit: config.orderbookSnapshotTokenLimit,
      }));
  const intervalMs =
    options.intervalMs ??
    (config.fastScanEnabled ? config.fastScanIntervalMs : config.scanIntervalMs);
  const snapshotIntervalMs =
    options.orderbookSnapshotIntervalMs ?? config.orderbookSnapshotIntervalMs;
  const dailyReportIntervalMs =
    options.dailyReportIntervalMs ?? config.telegramDailyReportIntervalMs;
  const maxScanCycles = config.runOnce ? 1 : config.maxScanCycles;
  const exit = options.exit ?? process.exit;
  const telegramConfig = loadTelegramAlertConfig(options.env);
  const sendAlert =
    options.sendAlert ??
    (async (message: string) => {
      const result = await sendTelegramAlert(telegramConfig, message);

      if (!result.ok) {
        logger.warn(
          formatStructuredLog("warn", "telegram_alert_failed", {
            error: result.error,
          }),
        );
      }
    });

  const notify = (message: string): void => {
    if (!telegramConfig.enabled) {
      return;
    }

    void sendAlert(message).catch((error: unknown) => {
      logger.warn(
        formatStructuredError("telegram_alert_unhandled_error", error, {
          component: "telegram",
        }),
      );
    });
  };
  const runCycle =
    options.runCycle ??
    (() =>
      runScanCycle({
        clearWinWatchScanner: scanClearWinWatchOpportunities,
        cleanBasketFilterOptions: {
          enabled: config.cleanBasketFilterEnabled,
          maxLegSpreadBps: config.cleanBasketMaxLegSpreadBps,
          maxShortDurationHours: config.maxShortArbDurationHours,
          minEdgeBps: config.cleanBasketMinEdgeBps,
          minLegDepthUsd: config.cleanBasketMinLegDepthUsd,
          minMaxPositiveBasketCostUsd:
            config.cleanBasketMinMaxPositiveCostUsd,
          minRoiBps: config.cleanBasketMinRoiBps,
        },
        paperFireCooldownMs: config.paperFireCooldownMs,
        sendAlert: telegramConfig.enabled ? sendAlert : undefined,
      }));
  const runDailyReport =
    options.runDailyReport ??
    (() =>
      runDailyTelegramReport({
        dbPath: options.dbPath ?? config.databasePath,
        sendAlert,
        windowHours: config.telegramDailyReportWindowHours,
      }));

  initDb(options.dbPath ?? config.databasePath);
  logger.info("bot starting in PAPER_ONLY mode");
  notify(
    formatTelegramAlert("Paper bot started", {
      orderbookSnapshots: config.orderbookSnapshotEnabled,
      paperOnly: true,
      runOnce: config.runOnce,
      scanIntervalMs: intervalMs,
      shortArbMaxHours: config.maxShortArbDurationHours,
    }),
  );
  const metricsServer =
    options.metricsServer === false ? undefined : startHealthServer({ logger });

  let completedCycles = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let snapshotInterval: ReturnType<typeof setInterval> | undefined;
  let dailyReportInterval: ReturnType<typeof setInterval> | undefined;
  let cycleInFlight = false;
  let snapshotInFlight = false;
  let dailyReportInFlight = false;
  let stopped = false;
  let resolveDone: () => void = () => undefined;

  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const stop = (shouldExit = false): void => {
    if (stopped) {
      return;
    }

    stopped = true;

    if (interval) {
      clearInterval(interval);
    }

    if (snapshotInterval) {
      clearInterval(snapshotInterval);
    }

    if (dailyReportInterval) {
      clearInterval(dailyReportInterval);
    }

    void closeHealthServer(metricsServer);
    closeDb();
    logger.info("shutdown complete");
    notify(
      formatTelegramAlert("Paper bot stopped", {
        paperOnly: true,
      }),
    );
    resolveDone();

    if (shouldExit) {
      exit(0);
    }
  };

  const runCycleSafely = (): void => {
    if (cycleInFlight) {
      incrementScanOverlapSkips();
      logger.warn(
        formatStructuredLog("warn", "scan_cycle_skipped", {
          reason: "previous_scan_still_running",
        }),
      );
      return;
    }

    cycleInFlight = true;

    void runCycle()
      .catch((error: unknown) => {
        incrementErrors();
        logger.error(
          formatStructuredError("scan_cycle_unhandled_error", error, {
            component: "main_loop",
          }),
        );
        notify(
          formatTelegramAlert("Paper bot scan error", {
            component: "main_loop",
            error: error instanceof Error ? error.message : String(error),
            paperOnly: true,
          }),
        );
      })
      .finally(() => {
        cycleInFlight = false;
        completedCycles += 1;

        if (maxScanCycles !== undefined && completedCycles >= maxScanCycles) {
          stop(true);
        }
      });
  };

  const runSnapshotSafely = (): void => {
    if (snapshotInFlight) {
      logger.warn(
        formatStructuredLog("warn", "orderbook_snapshot_skipped", {
          reason: "previous_snapshot_still_running",
        }),
      );
      return;
    }

    snapshotInFlight = true;

    void runSnapshotCycle()
      .catch((error: unknown) => {
        incrementErrors();
        logger.error(
          formatStructuredError("orderbook_snapshot_unhandled_error", error, {
            component: "main_loop",
          }),
        );
        notify(
          formatTelegramAlert("Paper bot snapshot error", {
            component: "main_loop",
            error: error instanceof Error ? error.message : String(error),
            paperOnly: true,
          }),
        );
      })
      .finally(() => {
        snapshotInFlight = false;
      });
  };

  const runDailyReportSafely = (): void => {
    if (dailyReportInFlight) {
      logger.warn(
        formatStructuredLog("warn", "telegram_daily_report_skipped", {
          reason: "previous_report_still_running",
        }),
      );
      return;
    }

    dailyReportInFlight = true;

    void runDailyReport()
      .catch((error: unknown) => {
        incrementErrors();
        logger.error(
          formatStructuredError("telegram_daily_report_failed", error, {
            component: "main_loop",
          }),
        );
        notify(
          formatTelegramAlert("Paper bot daily report failed", {
            component: "main_loop",
            error: error instanceof Error ? error.message : String(error),
            paperOnly: true,
          }),
        );
      })
      .finally(() => {
        dailyReportInFlight = false;
      });
  };

  if (config.runOnce || options.runInitialScan !== false) {
    runCycleSafely();
  }

  if (!config.runOnce) {
    interval = setInterval(runCycleSafely, intervalMs);
  }

  if (config.orderbookSnapshotEnabled) {
    logger.info("orderbook snapshot collector enabled");

    if (options.runInitialSnapshot !== false) {
      runSnapshotSafely();
    }

    if (!config.runOnce) {
      snapshotInterval = setInterval(runSnapshotSafely, snapshotIntervalMs);
    }
  }

  if (telegramConfig.enabled && config.telegramDailyReportEnabled) {
    logger.info("telegram daily report enabled");

    if (config.telegramDailyReportOnStart) {
      runDailyReportSafely();
    }

    if (!config.runOnce) {
      dailyReportInterval = setInterval(
        runDailyReportSafely,
        dailyReportIntervalMs,
      );
    }
  }

  if (options.registerSignals !== false) {
    registerShutdownHandlers(stop, logger);
  }

  return {
    done,
    dailyReportInterval,
    interval,
    metricsServer,
    snapshotInterval,
    stop: () => stop(false),
  };
}

function registerShutdownHandlers(
  stop: () => void,
  logger: ScanCycleLogger,
): void {
  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`received ${signal}; shutting down`);
    stop();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean env value: ${value}`);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parsePositiveInteger(value, 1, name);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  startBot();
}
