import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "../src/execution/db.js";
import { assertPaperOnlyEnv, loadBotConfig, startBot } from "../src/index.js";

const testDbPath = join("logs", "index-test.db");

describe("startup", () => {
  afterEach(() => {
    vi.useRealTimers();
    closeDb();
    rmSync(testDbPath, { force: true });
  });

  it("accepts missing PAPER_ONLY as paper-only default", () => {
    expect(() => assertPaperOnlyEnv({})).not.toThrow();
  });

  it("rejects non-paper-only env settings", () => {
    expect(() => assertPaperOnlyEnv({ PAPER_ONLY: "false" })).toThrow(
      "PAPER_ONLY must be true"
    );
  });

  it("starts in PAPER_ONLY mode and schedules scan cycles", async () => {
    vi.useFakeTimers();

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
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
      runInitialScan: false
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
      databasePath: undefined,
      maxScanCycles: undefined,
      paperFireCooldownMs: 21_600_000,
      runOnce: false,
      scanIntervalMs: 30_000
    });
  });

  it("RUN_ONCE exits after one scan", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
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
      runCycle
    });

    await handle.done;

    expect(handle.interval).toBeUndefined();
    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
