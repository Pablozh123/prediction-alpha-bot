import "dotenv/config";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { closeDb, initDb } from "./execution/db.js";
import { runScanCycle, type ScanCycleLogger } from "./scanner/runScanCycle.js";
import { closeHealthServer, startHealthServer } from "./utils/health.js";
import {
  formatStructuredError,
  formatStructuredLog,
  logError,
  logInfo,
  logWarn
} from "./utils/logger.js";
import { incrementErrors, incrementScanOverlapSkips } from "./utils/metrics.js";

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const DEFAULT_PAPER_FIRE_COOLDOWN_MS = 21_600_000;

type StartBotOptions = {
  argv?: string[];
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
  exit?: (code?: number) => void;
  intervalMs?: number;
  logger?: ScanCycleLogger;
  metricsServer?: boolean;
  registerSignals?: boolean;
  runCycle?: () => Promise<unknown>;
  runInitialScan?: boolean;
};

export type BotConfig = {
  databasePath?: string;
  maxScanCycles?: number;
  paperFireCooldownMs: number;
  runOnce: boolean;
  scanIntervalMs: number;
};

export type BotHandle = {
  done: Promise<void>;
  interval?: ReturnType<typeof setInterval>;
  metricsServer?: Server;
  stop(): void;
};

const defaultLogger: ScanCycleLogger = {
  info: logInfo,
  warn: logWarn,
  error: logError
};

export function assertPaperOnlyEnv(env: NodeJS.ProcessEnv = process.env): void {
  const paperOnly = (env.PAPER_ONLY ?? "true").trim().toLowerCase();

  if (paperOnly !== "true") {
    throw new Error("PAPER_ONLY must be true. Live trading is not implemented.");
  }
}

export function loadBotConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): BotConfig {
  assertPaperOnlyEnv(env);

  return {
    databasePath: env.DATABASE_PATH?.trim() || undefined,
    maxScanCycles: parseOptionalPositiveInteger(
      env.MAX_SCAN_CYCLES,
      "MAX_SCAN_CYCLES"
    ),
    paperFireCooldownMs: parsePositiveInteger(
      env.PAPER_FIRE_COOLDOWN_MS,
      DEFAULT_PAPER_FIRE_COOLDOWN_MS,
      "PAPER_FIRE_COOLDOWN_MS"
    ),
    runOnce: argv.includes("--once") || parseBoolean(env.RUN_ONCE, false),
    scanIntervalMs: parsePositiveInteger(
      env.SCAN_INTERVAL_MS,
      DEFAULT_SCAN_INTERVAL_MS,
      "SCAN_INTERVAL_MS"
    )
  };
}

export function startBot(options: StartBotOptions = {}): BotHandle {
  const logger = options.logger ?? defaultLogger;
  const config = loadBotConfig(
    options.env,
    options.argv ?? process.argv.slice(2)
  );
  const runCycle =
    options.runCycle ??
    (() =>
      runScanCycle({
        paperFireCooldownMs: config.paperFireCooldownMs
      }));
  const intervalMs = options.intervalMs ?? config.scanIntervalMs;
  const maxScanCycles = config.runOnce ? 1 : config.maxScanCycles;
  const exit = options.exit ?? process.exit;

  initDb(options.dbPath ?? config.databasePath);
  logger.info("bot starting in PAPER_ONLY mode");
  const metricsServer =
    options.metricsServer === false
      ? undefined
      : startHealthServer({ logger });

  let completedCycles = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let cycleInFlight = false;
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

    void closeHealthServer(metricsServer);
    closeDb();
    logger.info("shutdown complete");
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
          reason: "previous_scan_still_running"
        })
      );
      return;
    }

    cycleInFlight = true;

    void runCycle().catch((error: unknown) => {
      incrementErrors();
      logger.error(
        formatStructuredError("scan_cycle_unhandled_error", error, {
          component: "main_loop"
        })
      );
    }).finally(() => {
      cycleInFlight = false;
      completedCycles += 1;

      if (maxScanCycles !== undefined && completedCycles >= maxScanCycles) {
        stop(true);
      }
    });
  };

  if (config.runOnce || options.runInitialScan !== false) {
    runCycleSafely();
  }

  if (!config.runOnce) {
    interval = setInterval(runCycleSafely, intervalMs);
  }

  if (options.registerSignals !== false) {
    registerShutdownHandlers(stop, logger);
  }

  return {
    done,
    interval,
    metricsServer,
    stop: () => stop(false)
  };
}

function registerShutdownHandlers(
  stop: () => void,
  logger: ScanCycleLogger
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
  name: string
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
  name: string
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  return parsePositiveInteger(value, 1, name);
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return (
    entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isMainModule()) {
  startBot();
}
