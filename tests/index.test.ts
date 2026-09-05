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
      env: { PAPER_ONLY: "true", CROSS_VENUE_SCAN_ENABLED: "false", PAPER_RESOLVE_ENABLED: "false" },
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
      arbPublishDir: undefined,
      arbPublishIntervalMs: 300_000,
      cleanBasketFilterEnabled: true,
      cleanBasketMaxLegSpreadBps: 250,
      cleanBasketMinEdgeBps: 100,
      cleanBasketMinLegDepthUsd: 100,
      cleanBasketMinMaxPositiveCostUsd: 100,
      cleanBasketMinRoiBps: 100,
      crossVenueAutoDiscover: true,
      crossVenueMinNetCents: undefined,
      crossVenuePairsPath: "config/crossVenuePairs.json",
      crossVenueScanEnabled: true,
      crossVenueScanIntervalMs: 300_000,
      databasePath: undefined,
      executionRoleMode: "taker",
      fastScanEnabled: true,
      fastScanIntervalMs: 10_000,
      maxShortArbDurationHours: 72,
      maxScanCycles: undefined,
      minAnnualizedNetPct: 10,
      minExecutableDepthUsd: 5,
      orderbookSnapshotEnabled: false,
      orderbookSnapshotGammaEventLimit: 400,
      orderbookSnapshotIntervalMs: 300_000,
      orderbookSnapshotMaxTokensPerMarket: 16,
      orderbookSnapshotTokenLimit: 160,
      paperFireCooldownMs: 21_600_000,
      paperResolveEnabled: true,
      paperResolveIntervalMs: 1_800_000,
      paperTargetSizeUsd: 20,
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
        CROSS_VENUE_SCAN_ENABLED: "false",
        PAPER_RESOLVE_ENABLED: "false",
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
        CROSS_VENUE_SCAN_ENABLED: "false",
        PAPER_RESOLVE_ENABLED: "false",
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
        CROSS_VENUE_SCAN_ENABLED: "false",
        PAPER_RESOLVE_ENABLED: "false",
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
      env: { PAPER_ONLY: "true", RUN_ONCE: "true", CROSS_VENUE_SCAN_ENABLED: "false", PAPER_RESOLVE_ENABLED: "false" },
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
      env: { PAPER_ONLY: "true", CROSS_VENUE_SCAN_ENABLED: "false", PAPER_RESOLVE_ENABLED: "false" },
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

  it("publishes the feed after every cycle and on the publish interval", async () => {
    vi.useFakeTimers();

    const publish = vi.fn(() => ({ written: true as const, path: "arb_scan.json", bytes: 1 }));
    const publisher = { publish, lastPublishedAt: null, enabled: true };
    const runCycle = vi.fn().mockResolvedValue({ success: true, opportunities: 0 });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const handle = startBot({
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true", CROSS_VENUE_SCAN_ENABLED: "false", PAPER_RESOLVE_ENABLED: "false" },
      intervalMs: 1_000,
      logger,
      metricsServer: false,
      publisher,
      publishIntervalMs: 5_000,
      registerSignals: false,
      runCycle,
      runInitialScan: false,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("after_cycle");
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"event":"heartbeat"'));

    await vi.advanceTimersByTimeAsync(4_000);

    expect(publish).toHaveBeenCalledWith("interval");
    handle.stop();
    await handle.done;
  });

  it("does not schedule a publish interval when no publish directory is set", async () => {
    vi.useFakeTimers();

    const publish = vi.fn(() => ({ written: false as const, reason: "publish_dir_unset" }));
    const handle = startBot({
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true", CROSS_VENUE_SCAN_ENABLED: "false", PAPER_RESOLVE_ENABLED: "false" },
      intervalMs: 1_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      metricsServer: false,
      publisher: { publish, lastPublishedAt: null, enabled: false },
      registerSignals: false,
      runCycle: vi.fn().mockResolvedValue(undefined),
      runInitialScan: false,
    });

    expect(handle.publishInterval).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publish).not.toHaveBeenCalled();
    handle.stop();
    await handle.done;
  });

  it("runs the cross-venue lane and paper resolution on their own intervals", async () => {
    vi.useFakeTimers();

    const runCrossVenueCycle = vi.fn().mockResolvedValue({ success: true });
    const runPaperResolve = vi.fn().mockResolvedValue({ resolvedCount: 0 });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const handle = startBot({
      crossVenueIntervalMs: 200,
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true" },
      intervalMs: 10_000,
      logger,
      metricsServer: false,
      paperResolveIntervalMs: 300,
      publisher: { publish: vi.fn(), lastPublishedAt: null, enabled: false },
      registerSignals: false,
      runCrossVenueCycle,
      runCycle: vi.fn().mockResolvedValue(undefined),
      runInitialScan: false,
      runPaperResolve,
    });

    expect(logger.info).toHaveBeenCalledWith("cross-venue scan lane enabled");
    expect(logger.info).toHaveBeenCalledWith("paper resolution loop enabled");
    expect(runCrossVenueCycle).toHaveBeenCalledTimes(1);
    expect(runPaperResolve).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);

    expect(runCrossVenueCycle).toHaveBeenCalledTimes(2);
    expect(runPaperResolve).toHaveBeenCalledTimes(2);
    handle.stop();
    await handle.done;
  });

  it("runs the cross-venue lane once inside a RUN_ONCE cycle before exiting", async () => {
    const runCrossVenueCycle = vi.fn().mockResolvedValue({ success: true });
    const exit = vi.fn();
    const publish = vi.fn(() => ({ written: true as const, path: "arb_scan.json", bytes: 1 }));

    const handle = startBot({
      dbPath: testDbPath,
      env: { PAPER_ONLY: "true", RUN_ONCE: "true", PAPER_RESOLVE_ENABLED: "false" },
      exit,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      metricsServer: false,
      publisher: { publish, lastPublishedAt: null, enabled: true },
      registerSignals: false,
      runCrossVenueCycle,
      runCycle: vi.fn().mockResolvedValue(undefined),
    });

    await handle.done;

    expect(runCrossVenueCycle).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("after_cycle");
    expect(exit).toHaveBeenCalledWith(0);
  });
});
