import "dotenv/config";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { DEFAULT_MIN_ANNUALIZED_NET_PCT } from "./core/opportunityEconomics.js";
import {
  parseExecutionRoleMode,
  type ExecutionRoleMode,
} from "./core/venueFees.js";
import { closeDb, initDb } from "./execution/db.js";
import { resolveOpenPaperTradesBatch } from "./execution/paperResolution.js";
import {
  createArbScanPublisher,
  type ArbScanPublisher,
} from "./publisher/arbScanPublisher.js";
import { scanClearWinWatchOpportunities } from "./scanner/clearWinWatchScanner.js";
import { runCrossVenueCycle } from "./scanner/crossVenueCycle.js";
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
const DEFAULT_PAPER_TARGET_SIZE_USD = 20;
const DEFAULT_MIN_EXECUTABLE_DEPTH_USD = 5;
const DEFAULT_ARB_PUBLISH_INTERVAL_MS = 300_000;
const DEFAULT_PAPER_RESOLVE_INTERVAL_MS = 1_800_000;
const DEFAULT_PAPER_RESOLVE_BATCH_LIMIT = 50;
const DEFAULT_CROSS_VENUE_SCAN_INTERVAL_MS = 300_000;
const DEFAULT_CROSS_VENUE_PAIRS_PATH = "config/crossVenuePairs.json";

/**
 * Pre-registered on 2026-09-04: the measurement window is 14 days from the
 * day the scanner goes live; the success criterion is resolved paper trades
 * that are linked to their candidate and show a positive net edge after venue
 * fees. Nothing is claimed before the window closes.
 */
export const MEASUREMENT_NOTE =
  "Pre-registered 2026-09-04: 14-day measurement window from go-live; criterion is resolved, candidate-linked paper trades with positive net edge after fees";

type StartBotOptions = {
  argv?: string[];
  crossVenueIntervalMs?: number;
  dbPath?: string;
  dailyReportIntervalMs?: number;
  env?: NodeJS.ProcessEnv;
  exit?: (code?: number) => void;
  intervalMs?: number;
  logger?: ScanCycleLogger;
  metricsServer?: boolean;
  orderbookSnapshotIntervalMs?: number;
  paperResolveIntervalMs?: number;
  publisher?: ArbScanPublisher;
  publishIntervalMs?: number;
  registerSignals?: boolean;
  runCrossVenueCycle?: () => Promise<unknown>;
  runCycle?: () => Promise<unknown>;
  runDailyReport?: () => Promise<unknown>;
  runInitialCrossVenue?: boolean;
  runInitialPaperResolve?: boolean;
  runInitialScan?: boolean;
  runInitialSnapshot?: boolean;
  runPaperResolve?: () => Promise<unknown>;
  runSnapshotCycle?: () => Promise<unknown>;
  sendAlert?: (message: string) => Promise<unknown>;
};

export type BotConfig = {
  arbPublishDir: string | undefined;
  arbPublishIntervalMs: number;
  cleanBasketFilterEnabled: boolean;
  cleanBasketMaxLegSpreadBps: number;
  cleanBasketMinEdgeBps: number;
  cleanBasketMinLegDepthUsd: number;
  cleanBasketMinMaxPositiveCostUsd: number;
  cleanBasketMinRoiBps: number;
  crossVenueAutoDiscover: boolean;
  crossVenueMinNetCents: number | undefined;
  crossVenuePairsPath: string;
  crossVenueScanEnabled: boolean;
  crossVenueScanIntervalMs: number;
  databasePath?: string;
  executionRoleMode: ExecutionRoleMode;
  fastScanEnabled: boolean;
  fastScanIntervalMs: number;
  maxShortArbDurationHours: number;
  maxScanCycles?: number;
  /** Hurdle rate in percent per year (docs/ARB_TAXONOMY.md, decision E1). */
  minAnnualizedNetPct: number;
  minExecutableDepthUsd: number;
  orderbookSnapshotEnabled: boolean;
  orderbookSnapshotGammaEventLimit: number;
  orderbookSnapshotIntervalMs: number;
  orderbookSnapshotMaxTokensPerMarket: number;
  orderbookSnapshotTokenLimit: number;
  paperFireCooldownMs: number;
  paperResolveEnabled: boolean;
  paperResolveIntervalMs: number;
  paperTargetSizeUsd: number;
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
  crossVenueInterval?: ReturnType<typeof setInterval>;
  dailyReportInterval?: ReturnType<typeof setInterval>;
  interval?: ReturnType<typeof setInterval>;
  metricsServer?: Server;
  paperResolveInterval?: ReturnType<typeof setInterval>;
  publishInterval?: ReturnType<typeof setInterval>;
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
    arbPublishDir: env.ARB_PUBLISH_DIR?.trim() || undefined,
    arbPublishIntervalMs: parsePositiveInteger(
      env.ARB_PUBLISH_INTERVAL_MS,
      DEFAULT_ARB_PUBLISH_INTERVAL_MS,
      "ARB_PUBLISH_INTERVAL_MS",
    ),
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
    crossVenueAutoDiscover: parseBoolean(env.CROSS_VENUE_AUTO_DISCOVER, true),
    crossVenueMinNetCents: parseOptionalNonNegativeNumber(
      env.CROSS_VENUE_MIN_NET_CENTS,
      "CROSS_VENUE_MIN_NET_CENTS",
    ),
    crossVenuePairsPath:
      env.CROSS_VENUE_PAIRS_PATH?.trim() || DEFAULT_CROSS_VENUE_PAIRS_PATH,
    crossVenueScanEnabled: parseBoolean(env.CROSS_VENUE_SCAN_ENABLED, true),
    crossVenueScanIntervalMs: parsePositiveInteger(
      env.CROSS_VENUE_SCAN_INTERVAL_MS,
      DEFAULT_CROSS_VENUE_SCAN_INTERVAL_MS,
      "CROSS_VENUE_SCAN_INTERVAL_MS",
    ),
    databasePath: env.DATABASE_PATH?.trim() || undefined,
    executionRoleMode: parseExecutionRoleMode(env.EXECUTION_ROLE_MODE, "taker"),
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
    minAnnualizedNetPct: parseNonNegativeNumber(
      env.MIN_ANNUALIZED_NET_PCT,
      DEFAULT_MIN_ANNUALIZED_NET_PCT,
      "MIN_ANNUALIZED_NET_PCT",
    ),
    minExecutableDepthUsd: parseNonNegativeNumber(
      env.MIN_EXECUTABLE_DEPTH_USD,
      DEFAULT_MIN_EXECUTABLE_DEPTH_USD,
      "MIN_EXECUTABLE_DEPTH_USD",
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
    paperResolveEnabled: parseBoolean(env.PAPER_RESOLVE_ENABLED, true),
    paperResolveIntervalMs: parsePositiveInteger(
      env.PAPER_RESOLVE_INTERVAL_MS,
      DEFAULT_PAPER_RESOLVE_INTERVAL_MS,
      "PAPER_RESOLVE_INTERVAL_MS",
    ),
    paperTargetSizeUsd: parsePositiveNumber(
      env.PAPER_TARGET_SIZE_USD,
      DEFAULT_PAPER_TARGET_SIZE_USD,
      "PAPER_TARGET_SIZE_USD",
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
  const crossVenueIntervalMs =
    options.crossVenueIntervalMs ?? config.crossVenueScanIntervalMs;
  const paperResolveIntervalMs =
    options.paperResolveIntervalMs ?? config.paperResolveIntervalMs;
  const publishIntervalMs =
    options.publishIntervalMs ?? config.arbPublishIntervalMs;
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
        hurdlePct: config.minAnnualizedNetPct,
        minExecutableDepthUsd: config.minExecutableDepthUsd,
        paperFireCooldownMs: config.paperFireCooldownMs,
        paperSizeUsd: config.paperTargetSizeUsd,
        roleMode: config.executionRoleMode,
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
  const runCrossVenue =
    options.runCrossVenueCycle ??
    (() =>
      runCrossVenueCycle({
        autoDiscover: config.crossVenueAutoDiscover,
        hurdlePct: config.minAnnualizedNetPct,
        logger,
        minNetCents: config.crossVenueMinNetCents,
        pairsPath: config.crossVenuePairsPath,
        roleMode: config.executionRoleMode,
      }));
  const runPaperResolve =
    options.runPaperResolve ??
    (async () => {
      const result = await resolveOpenPaperTradesBatch({
        limit: DEFAULT_PAPER_RESOLVE_BATCH_LIMIT,
      });

      logger.info(
        formatStructuredLog("info", "paper_resolution_batch", {
          checkedSlugs: result.checkedSlugs,
          resolvedCount: result.resolvedCount,
          unresolvedCount: result.unresolvedCount,
          flaggedCount: result.flaggedCount,
          closedWithoutFigureCount: result.closedWithoutFigureCount,
          skippedNoSlugCount: result.skippedNoSlugCount,
        }),
      );

      return result;
    });

  initDb(options.dbPath ?? config.databasePath);
  logger.info("bot starting in PAPER_ONLY mode");
  logger.info(
    formatStructuredLog("info", "scanner_config", {
      crossVenueScanEnabled: config.crossVenueScanEnabled,
      executionRoleMode: config.executionRoleMode,
      hurdlePct: config.minAnnualizedNetPct,
      minExecutableDepthUsd: config.minExecutableDepthUsd,
      paperResolveEnabled: config.paperResolveEnabled,
      paperTargetSizeUsd: config.paperTargetSizeUsd,
      publishEnabled: Boolean(config.arbPublishDir),
      scanIntervalMs: intervalMs,
    }),
  );
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
  const publisher =
    options.publisher ??
    createArbScanPublisher({
      dir: config.arbPublishDir,
      logger,
      sampleNote: MEASUREMENT_NOTE,
      scanIntervalMs: intervalMs,
      config: {
        hurdlePct: config.minAnnualizedNetPct,
        targetSizeUsd: config.paperTargetSizeUsd,
        minExecutableDepthUsd: config.minExecutableDepthUsd,
        cleanBasketMinEdgeBps: config.cleanBasketMinEdgeBps,
        crossVenueMinNetCents: config.crossVenueMinNetCents ?? 0.5,
        shortMaxHours: config.maxShortArbDurationHours,
        executionRoleMode: config.executionRoleMode,
      },
    });

  let completedCycles = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let snapshotInterval: ReturnType<typeof setInterval> | undefined;
  let dailyReportInterval: ReturnType<typeof setInterval> | undefined;
  let crossVenueInterval: ReturnType<typeof setInterval> | undefined;
  let paperResolveInterval: ReturnType<typeof setInterval> | undefined;
  let publishInterval: ReturnType<typeof setInterval> | undefined;
  let cycleInFlight = false;
  let overlapSkips = 0;
  let snapshotInFlight = false;
  let dailyReportInFlight = false;
  let crossVenueInFlight = false;
  let paperResolveInFlight = false;
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

    for (const timer of [
      interval,
      snapshotInterval,
      dailyReportInterval,
      crossVenueInterval,
      paperResolveInterval,
      publishInterval,
    ]) {
      if (timer) {
        clearInterval(timer);
      }
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

  const publishSafely = (reason: string): void => {
    if (stopped || !publisher.enabled) {
      return;
    }

    try {
      publisher.publish(reason);
    } catch (error) {
      incrementErrors();
      logger.error(
        formatStructuredError("arb_scan_publish_unhandled_error", error, {
          component: "publisher",
        }),
      );
    }
  };

  const runCrossVenueSafely = (): Promise<void> => {
    if (crossVenueInFlight) {
      logger.warn(
        formatStructuredLog("warn", "cross_venue_cycle_skipped", {
          reason: "previous_cross_venue_cycle_still_running",
        }),
      );
      return Promise.resolve();
    }

    crossVenueInFlight = true;

    return runCrossVenue()
      .then(() => undefined)
      .catch((error: unknown) => {
        incrementErrors();
        logger.error(
          formatStructuredError("cross_venue_cycle_unhandled_error", error, {
            component: "main_loop",
          }),
        );
      })
      .finally(() => {
        crossVenueInFlight = false;
      });
  };

  const runCycleSafely = (): void => {
    if (cycleInFlight) {
      incrementScanOverlapSkips();
      overlapSkips += 1;

      // A cycle that walks hundreds of books takes longer than a ten-second
      // interval, so this overlap is the normal state, not a fault. It is
      // logged on the first skip and then once per hundred, with the count;
      // the feed reports the effective cadence from the cycle timestamps.
      if (overlapSkips === 1 || overlapSkips % 100 === 0) {
        logger.warn(
          formatStructuredLog("warn", "scan_cycle_skipped", {
            reason: "previous_scan_still_running",
            skips: overlapSkips,
          }),
        );
      }

      return;
    }

    cycleInFlight = true;

    const cycle = config.runOnce && config.crossVenueScanEnabled
      ? runCycle().then((result) => runCrossVenueSafely().then(() => result))
      : runCycle();

    void cycle
      .then((result) => {
        logger.info(
          formatStructuredLog("info", "heartbeat", {
            cycle: completedCycles + 1,
            result: summarizeCycleResult(result),
          }),
        );
      })
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
        publishSafely("after_cycle");

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

  const runPaperResolveSafely = (): void => {
    if (paperResolveInFlight) {
      logger.warn(
        formatStructuredLog("warn", "paper_resolution_skipped", {
          reason: "previous_paper_resolution_still_running",
        }),
      );
      return;
    }

    paperResolveInFlight = true;

    void runPaperResolve()
      .catch((error: unknown) => {
        incrementErrors();
        logger.error(
          formatStructuredError("paper_resolution_failed", error, {
            component: "main_loop",
          }),
        );
      })
      .finally(() => {
        paperResolveInFlight = false;
      });
  };

  if (config.runOnce || options.runInitialScan !== false) {
    runCycleSafely();
  }

  if (!config.runOnce) {
    interval = setInterval(runCycleSafely, intervalMs);

    if (publisher.enabled) {
      publishInterval = setInterval(() => publishSafely("interval"), publishIntervalMs);
    }

    if (config.crossVenueScanEnabled) {
      logger.info("cross-venue scan lane enabled");

      if (options.runInitialCrossVenue !== false) {
        void runCrossVenueSafely();
      }

      crossVenueInterval = setInterval(() => {
        void runCrossVenueSafely();
      }, crossVenueIntervalMs);
    }

    if (config.paperResolveEnabled) {
      logger.info("paper resolution loop enabled");

      if (options.runInitialPaperResolve !== false) {
        runPaperResolveSafely();
      }

      paperResolveInterval = setInterval(runPaperResolveSafely, paperResolveIntervalMs);
    }
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
    crossVenueInterval,
    dailyReportInterval,
    interval,
    metricsServer,
    paperResolveInterval,
    publishInterval,
    snapshotInterval,
    stop: () => stop(false),
  };
}

function summarizeCycleResult(result: unknown): Record<string, unknown> | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }

  const record = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  for (const key of [
    "success",
    "opportunities",
    "paperTrades",
    "skippedDuplicates",
    "rejectedOpportunities",
    "rejectionsByReason",
  ]) {
    if (key in record) {
      summary[key] = record[key];
    }
  }

  return summary;
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

function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return parsed;
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return parsed;
}

function parseOptionalNonNegativeNumber(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parseNonNegativeNumber(value, 0, name);
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
