import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "../src/execution/db.js";
import { assertPaperOnlyEnv, loadBotConfig, startBot } from "../src/index.js";
import { getMetricsSnapshot, resetMetrics } from "../src/utils/metrics.js";

const testDbPath = join("logs", "index-test.db");

describe("startup", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetMetrics();
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("accepts missing PAPER_ONLY as paper-only default", () => {
    expect(() => assertPaperOnlyEnv({})).not.toThrow();
  });

  it("rejects non-paper-only env settings", () => {
    expect(() => assertPaperOnlyEnv({ PAPER_ONLY: "false" })).toThrow(
      "PAPER_ONLY must be true",
    );
  });

  it("starts in PAPER_ONLY mode and schedules scan cycles", async () => {
    vi.useFakeTimers();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runCycle = vi.fn().mockResolvedValue(undefined);

    const handle = startBot({
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true" },
      intervalMs: 30_000,
      logger,
      metricsServer: false,
      registerSignals: false,
      runCycle,
      runInitialScan: false,
    });

    expect(logger.info).toHaveBeenCalledWith("bot starting in PAPER_ONLY mode");
    expect(runCycle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(runCycle).toHaveBeenCalledTimes(1);
    handle.stop();
    await handle.done;
  });

  it("loads dry-run config defaults", () => {
    expect(loadBotConfig({ PAPER_ONLY: "true" }, [])).toEqual({
      cleanBasketFilterEnabled: true,
      cleanBasketMaxLegSpreadBps: 250,
      cleanBasketMinEdgeBps: 100,
      cleanBasketMinLegDepthUsd: 100,
      cleanBasketMinMaxPositiveCostUsd: 100,
      cleanBasketMinRoiBps: 100,
      databasePath: undefined,
      fastScanEnabled: true,
      fastScanIntervalMs: 10_000,
      maxShortArbDurationHours: 72,
      maxScanCycles: undefined,
      orderbookSnapshotEnabled: false,
      orderbookSnapshotGammaEventLimit: 400,
      orderbookSnapshotIntervalMs: 300_000,
      orderbookSnapshotMaxTokensPerMarket: 16,
      orderbookSnapshotTokenLimit: 160,
      paperFireCooldownMs: 21_600_000,
      runOnce: false,
      scanIntervalMs: 30_000,
      telegramAlertsEnabled: false,
      telegramDailyReportEnabled: false,
      telegramDailyReportIntervalMs: 86_400_000,
      telegramDailyReportOnStart: false,
      telegramDailyReportWindowHours: 24,
    });
  });

  it("sends lifecycle alerts when Telegram alerts are enabled", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runCycle = vi.fn().mockResolvedValue(undefined);
    const sendAlert = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const handle = startBot({
      dbPath: testDbPath,
      env: {
        PAPER_ONLY: "true",
        RUN_ONCE: "true",
        TELEGRAM_ALERTS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_CHAT_ID: "test-chat",
      },
      exit,
      logger,
      metricsServer: false,
      registerSignals: false,
      runCycle,
      sendAlert,
    });

    await handle.done;

    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining("Paper bot started"),
    );
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining("Paper bot stopped"),
    );
    expect(sendAlert).not.toHaveBeenCalledWith(
      expect.stringContaining("test-token"),
    );
  });

  it("can enable the orderbook snapshot collector", async () => {
    vi.useFakeTimers();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runCycle = vi.fn().mockResolvedValue(undefined);
    const runSnapshotCycle = vi.fn().mockResolvedValue(undefined);

    const handle = startBot({
      dbPath: testDbPath,
      env: {
        ORDERBOOK_SNAPSHOT_ENABLED: "true",
        ORDERBOOK_SNAPSHOT_INTERVAL_MS: "100",
        PAPER_ONLY: "true",
      },
      intervalMs: 30_000,
      logger,
      metricsServer: false,
      registerSignals: false,
      runCycle,
      runInitialScan: false,
      runSnapshotCycle,
    });

    expect(logger.info).toHaveBeenCalledWith(
      "orderbook snapshot collector enabled",
    );
    expect(runSnapshotCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(runSnapshotCycle).toHaveBeenCalledTimes(2);
    handle.stop();
    await handle.done;
  });

  it("can schedule a Telegram daily report when enabled", async () => {
    vi.useFakeTimers();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runCycle = vi.fn().mockResolvedValue(undefined);
    const runDailyReport = vi.fn().mockResolvedValue(undefined);

    const handle = startBot({
      dailyReportIntervalMs: 100,
      dbPath: testDbPath,
      env: {
        PAPER_ONLY: "true",
        TELEGRAM_ALERTS_ENABLED: "true",
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_CHAT_ID: "test-chat",
        TELEGRAM_DAILY_REPORT_ENABLED: "true",
        TELEGRAM_DAILY_REPORT_ON_START: "true",
      },
      logger,
      metricsServer: false,
      registerSignals: false,
      runCycle,
      runDailyReport,
      runInitialScan: false,
    });

    expect(logger.info).toHaveBeenCalledWith("telegram daily report enabled");
    expect(runDailyReport).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(runDailyReport).toHaveBeenCalledTimes(2);
    handle.stop();
    await handle.done;
  });

  it("RUN_ONCE exits after one scan", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runCycle = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const handle = startBot({
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true", RUN_ONCE: "true" },
      exit,
      logger,
      metricsServer: false,
      registerSignals: false,
      runCycle,
    });

    await handle.done;

    expect(handle.interval).toBeUndefined();
    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("skips overlapping interval scans while a previous scan is still running", async () => {
    vi.useFakeTimers();
    resetMetrics();

    let resolveRun: () => void = () => undefined;
    const runCycle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const handle = startBot({
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true" },
      intervalMs: 100,
      logger,
      metricsServer: false,
      registerSignals: false,
      runCycle,
      runInitialScan: false,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(getMetricsSnapshot().botScanOverlapSkipsTotal).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"scan_cycle_skipped"'),
    );

    resolveRun();
    await vi.advanceTimersByTimeAsync(0);
    handle.stop();
    await handle.done;
  });
});
